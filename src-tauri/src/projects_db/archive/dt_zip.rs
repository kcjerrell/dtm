use std::path::PathBuf;

use anyhow::Result;
use s_zip::AsyncStreamingZipReader;
use tokio::{fs::File, io::AsyncWriteExt, sync::Mutex};

pub struct DTZip {
    pub archive_path: String,
    pub db_path: String,
    reader: Mutex<AsyncStreamingZipReader>,
}

impl std::fmt::Debug for DTZip {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DTZip")
            .field("archive_path", &self.archive_path)
            .field("db_path", &self.db_path)
            .field("reader", &"<AsyncStreamingZipReader>")
            .finish()
    }
}

impl DTZip {
    pub async fn new(archive_path: &str, temp_dir: &str) -> Result<Self> {
        let (mut file, path) = DTZip::create_temp_db_file(archive_path, temp_dir).await?;
        let mut reader = AsyncStreamingZipReader::open(archive_path).await?;
        let data = reader.read_entry_by_name("project.dtm").await?;
        file.write_all(&data).await?;
        file.flush().await?;
        Ok(DTZip {
            archive_path: archive_path.to_string(),
            db_path: path.to_string(),
            reader: Mutex::new(reader),
        })
    }

    pub async fn get_file(&self, rel_path: &str) -> Result<Vec<u8>> {
        // Check for path traversal attempts
        if rel_path.contains("..") || rel_path.starts_with('/') || rel_path.starts_with('\\') {
            return Err(anyhow::anyhow!(
                "Invalid path: potential path traversal detected"
            ));
        }

        let mut reader = self.reader.lock().await;
        let data = reader.read_entry_by_name(rel_path).await?;
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

fn format_name(name: &str, suffix: i32) -> String {
    if suffix == 0 {
        format!("{}.dtm", name)
    } else {
        format!("{}_{}.dtm", name, suffix)
    }
}
