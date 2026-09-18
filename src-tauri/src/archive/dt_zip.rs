use std::path::PathBuf;

use anyhow::{Context, Result};
use s_zip::AsyncStreamingZipReader;
use tokio::{
    fs::{self, File},
    io::AsyncWriteExt,
    sync::{Mutex, OnceCell},
};

pub struct DTZip {
    pub archive_path: String,
    pub db_path: String,
    reader: Mutex<AsyncStreamingZipReader>,
    db_extracted: OnceCell<()>,
}

struct StagedDb {
    path: String,
    committed: bool,
}

impl StagedDb {
    fn new(path: String) -> Self {
        Self {
            path,
            committed: false,
        }
    }
}

impl Drop for StagedDb {
    fn drop(&mut self) {
        if !self.committed {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

impl std::fmt::Debug for DTZip {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DTZip")
            .field("archive_path", &self.archive_path)
            .field("db_path", &self.db_path)
            .field("reader", &"<AsyncStreamingZipReader>")
            .field("db_extracted", &self.db_extracted.get().is_some())
            .finish()
    }
}

impl Drop for DTZip {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.db_path);
        let _ = std::fs::remove_file(format!("{}.part", self.db_path));
    }
}

impl DTZip {
    pub async fn new(archive_path: &str, temp_dir: &str) -> Result<Self> {
        let reader = AsyncStreamingZipReader::open(archive_path)
            .await
            .with_context(|| format!("failed to open zip archive '{archive_path}'"))?;
        let (_file, path) = DTZip::create_temp_db_file(archive_path, temp_dir)
            .await
            .with_context(|| {
                format!("failed to reserve temporary database path for archive '{archive_path}'")
            })?;
        Ok(DTZip {
            archive_path: archive_path.to_string(),
            db_path: path.to_string(),
            reader: Mutex::new(reader),
            db_extracted: OnceCell::new(),
        })
    }

    pub async fn ensure_db_extracted(&self) -> Result<()> {
        self.db_extracted
            .get_or_try_init(|| async { self.extract_db().await })
            .await?;
        Ok(())
    }

    async fn extract_db(&self) -> Result<()> {
        let data = {
            let mut reader = self.reader.lock().await;
            reader
                .read_entry_by_name("project.dtm")
                .await
                .with_context(|| {
                    format!(
                        "failed to extract 'project.dtm' from zip archive '{}' for temporary database '{}'",
                        self.archive_path, self.db_path
                    )
                })?
        };

        let mut staged = StagedDb::new(format!("{}.part", self.db_path));
        let mut file = File::create(&staged.path).await.with_context(|| {
            format!(
                "failed to create staged database '{}' for zip archive '{}'",
                staged.path, self.archive_path
            )
        })?;
        file.write_all(&data).await.with_context(|| {
            format!(
                "failed to write staged database '{}' for zip archive '{}'",
                staged.path, self.archive_path
            )
        })?;
        file.flush().await.with_context(|| {
            format!(
                "failed to flush staged database '{}' for zip archive '{}'",
                staged.path, self.archive_path
            )
        })?;
        drop(file);
        fs::rename(&staged.path, &self.db_path)
            .await
            .with_context(|| {
                format!(
                    "failed to install extracted database at '{}' for zip archive '{}'",
                    self.db_path, self.archive_path
                )
            })?;
        staged.committed = true;
        Ok(())
    }

    pub async fn contains_file(&self, rel_path: &str) -> Result<bool> {
        validate_rel_path(rel_path)?;
        let reader = self.reader.lock().await;
        Ok(reader.find_entry(rel_path).is_some())
    }

    pub async fn get_file(&self, rel_path: &str) -> Result<Vec<u8>> {
        validate_rel_path(rel_path)?;

        let mut reader = self.reader.lock().await;
        let data = reader.read_entry_by_name(rel_path).await.with_context(|| {
            format!(
                "failed to read entry '{rel_path}' from zip archive '{}'",
                self.archive_path
            )
        })?;
        Ok(data)
    }

    async fn create_temp_db_file(original_path: &str, temp_dir: &str) -> Result<(File, String)> {
        let pb = PathBuf::from(original_path);
        let name = pb
            .file_name()
            .ok_or_else(|| anyhow::anyhow!("invalid filename"))?
            .to_string_lossy()
            .to_string();
        let name = name.strip_suffix(".dtm.zip").unwrap_or(&name);
        let mut suffix = 0;
        let temp_dir = PathBuf::from(temp_dir);

        loop {
            let filename = format_name(name, suffix);
            let filepath = temp_dir.join(filename);
            match File::create_new(&filepath).await {
                Ok(file) => {
                    return Ok((file, filepath.to_string_lossy().to_string()));
                }
                Err(e) => {
                    if e.kind() == std::io::ErrorKind::AlreadyExists {
                        suffix += 1;
                    } else {
                        return Err(e.into());
                    }
                }
            }
        }
    }
}

fn validate_rel_path(rel_path: &str) -> Result<()> {
    if rel_path.contains("..") || rel_path.starts_with('/') || rel_path.starts_with('\\') {
        anyhow::bail!("Invalid path: potential path traversal detected in '{rel_path}'");
    }
    Ok(())
}

fn format_name(name: &str, suffix: i32) -> String {
    if suffix == 0 {
        format!("{}.dtm", name)
    } else {
        format!("{}_{}.dtm", name, suffix)
    }
}

#[cfg(test)]
mod tests {
    use std::{io::Write, sync::Arc};

    use tempfile::tempdir;
    use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

    use super::*;

    fn write_zip(path: &std::path::Path, entries: &[(&str, &[u8])]) -> Result<()> {
        let file = std::fs::File::create(path)?;
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        for (name, data) in entries {
            zip.start_file(*name, options)?;
            zip.write_all(data)?;
        }
        zip.finish()?;
        Ok(())
    }

    #[tokio::test]
    async fn construction_and_media_reads_do_not_materialize_database() -> Result<()> {
        let dir = tempdir()?;
        let archive_path = dir.path().join("reader-only.dtm.zip");
        write_zip(
            &archive_path,
            &[("project.dtm", b"database"), ("thumbhalf/7.jpg", b"jpeg")],
        )?;

        let archive = DTZip::new(
            archive_path.to_string_lossy().as_ref(),
            dir.path().to_string_lossy().as_ref(),
        )
        .await?;

        assert_eq!(fs::metadata(&archive.db_path).await?.len(), 0);
        assert!(archive.contains_file("thumbhalf/7.jpg").await?);
        assert_eq!(archive.get_file("thumbhalf/7.jpg").await?, b"jpeg");
        assert!(archive.db_extracted.get().is_none());
        assert_eq!(fs::metadata(&archive.db_path).await?.len(), 0);
        Ok(())
    }

    #[tokio::test]
    async fn concurrent_materialization_publishes_one_complete_database() -> Result<()> {
        let dir = tempdir()?;
        let archive_path = dir.path().join("concurrent.dtm.zip");
        write_zip(&archive_path, &[("project.dtm", b"database bytes")])?;
        let archive = Arc::new(
            DTZip::new(
                archive_path.to_string_lossy().as_ref(),
                dir.path().to_string_lossy().as_ref(),
            )
            .await?,
        );

        let (first, second) =
            tokio::join!(archive.ensure_db_extracted(), archive.ensure_db_extracted());
        first?;
        second?;

        assert_eq!(fs::read(&archive.db_path).await?, b"database bytes");
        assert!(archive.db_extracted.get().is_some());
        assert!(!fs::try_exists(format!("{}.part", archive.db_path)).await?);
        Ok(())
    }

    #[tokio::test]
    async fn failed_materialization_is_clean_and_retryable() -> Result<()> {
        let dir = tempdir()?;
        let archive_path = dir.path().join("missing-db.dtm.zip");
        write_zip(&archive_path, &[("thumbhalf/7.jpg", b"jpeg")])?;
        let archive = DTZip::new(
            archive_path.to_string_lossy().as_ref(),
            dir.path().to_string_lossy().as_ref(),
        )
        .await?;

        for _ in 0..2 {
            let error = archive.ensure_db_extracted().await.unwrap_err();
            assert!(error.to_string().contains("project.dtm"));
            assert!(archive.db_extracted.get().is_none());
            assert_eq!(fs::metadata(&archive.db_path).await?.len(), 0);
            assert!(!fs::try_exists(format!("{}.part", archive.db_path)).await?);
        }
        Ok(())
    }
}
