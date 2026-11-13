use std::fs::File;
use std::io::{self, Read, Seek};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::Deserialize;
use tokio::io::AsyncWriteExt;

use crate::{IntoTAResult, TAResult};

#[derive(Deserialize)]
#[serde(tag = "kind", content = "location", rename_all = "lowercase")]
pub(crate) enum SnapshotSource {
    File(PathBuf),
    Url(String),
}

#[tauri::command]
pub(crate) async fn stage_media_snapshot(
    source: SnapshotSource,
    destination: PathBuf,
) -> TAResult<()> {
    let parent = destination
        .parent()
        .context("media cache path has no parent")?;
    let staged = tempfile::NamedTempFile::new_in(parent)
        .with_context(|| format!("failed to stage media in {}", parent.display()))?;
    let mut output =
        tokio::fs::File::from_std(staged.reopen().context("failed to open staged media")?);
    let size = match source {
        SnapshotSource::File(path) => {
            let metadata = tokio::fs::metadata(&path)
                .await
                .with_context(|| format!("failed to inspect source media at {}", path.display()))?;
            crate::ensure!(metadata.is_file(), "media source is not a file");
            let mut input = tokio::fs::File::open(&path)
                .await
                .with_context(|| format!("failed to open media at {}", path.display()))?;
            tokio::io::copy(&mut input, &mut output)
                .await
                .with_context(|| format!("failed to cache media from {}", path.display()))?
        }
        SnapshotSource::Url(url) => {
            let url = reqwest::Url::parse(&url).context("invalid media URL")?;
            crate::ensure!(
                matches!(url.scheme(), "http" | "https"),
                "expected an HTTP(S) media URL"
            );
            let mut response = reqwest::get(url)
                .await
                .context("failed to fetch media")?
                .error_for_status()
                .context("failed to fetch media")?;
            let mut size = 0;
            while let Some(chunk) = response
                .chunk()
                .await
                .context("failed to read media response")?
            {
                output
                    .write_all(&chunk)
                    .await
                    .context("failed to write staged media")?;
                size += chunk.len() as u64;
            }
            size
        }
    };
    crate::ensure!(size > 0, "media source is empty");
    output
        .flush()
        .await
        .context("failed to flush staged media")?;
    drop(output);
    staged
        .persist_noclobber(&destination)
        .with_context(|| format!("failed to cache media at {}", destination.display()))?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn find_matching_media_file(
    incoming: PathBuf,
    candidates: Vec<PathBuf>,
) -> TAResult<Option<usize>> {
    Ok(
        tokio::task::spawn_blocking(move || find_match(&incoming, &candidates))
            .await
            .context("media file comparison task failed")??,
    )
}

fn find_match(incoming: &Path, candidates: &[PathBuf]) -> Result<Option<usize>> {
    let mut incoming_file = File::open(incoming)
        .with_context(|| format!("failed to open media at {}", incoming.display()))?;
    let size = incoming_file
        .metadata()
        .context("failed to inspect incoming media")?
        .len();
    for (index, path) in candidates.iter().enumerate() {
        let mut cached = match File::open(path) {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => {
                return Err(error)
                    .with_context(|| format!("failed to open cached media at {}", path.display()))
            }
        };
        if cached
            .metadata()
            .with_context(|| format!("failed to inspect {}", path.display()))?
            .len()
            != size
        {
            continue;
        }
        incoming_file
            .rewind()
            .context("failed to rewind incoming media")?;
        if contents_match(&mut incoming_file, &mut cached, size)
            .with_context(|| format!("failed to compare media with {}", path.display()))?
        {
            return Ok(Some(index));
        }
    }
    Ok(None)
}

fn contents_match(first: &mut File, second: &mut File, mut remaining: u64) -> io::Result<bool> {
    let mut left = [0; 64 * 1024];
    let mut right = [0; 64 * 1024];
    while remaining > 0 {
        let size = remaining.min(left.len() as u64) as usize;
        first.read_exact(&mut left[..size])?;
        second.read_exact(&mut right[..size])?;
        if left[..size] != right[..size] {
            return Ok(false);
        }
        remaining -= size as u64;
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn stages_a_file_without_overwriting_the_earlier_snapshot() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let source = dir.path().join("source");
        let snapshot = dir.path().join("snapshot");
        std::fs::write(&source, b"original")?;
        stage_media_snapshot(SnapshotSource::File(source.clone()), snapshot.clone()).await?;

        std::fs::write(&source, b"changed")?;
        assert!(
            stage_media_snapshot(SnapshotSource::File(source), snapshot.clone())
                .await
                .is_err()
        );
        assert_eq!(std::fs::read(snapshot)?, b"original");
        assert_eq!(std::fs::read_dir(dir.path())?.count(), 2);
        Ok(())
    }

    #[test]
    fn matches_an_older_snapshot_after_missing_and_different_candidates() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let incoming = dir.path().join("incoming");
        let shorter = dir.path().join("shorter");
        let changed = dir.path().join("changed");
        let original = dir.path().join("original");
        let mut data = vec![1; 128 * 1024 + 1];
        std::fs::write(&incoming, &data)?;
        std::fs::write(&original, &data)?;
        std::fs::write(&shorter, &data[..data.len() - 1])?;
        data[128 * 1024] = 2;
        std::fs::write(&changed, &data)?;

        let candidates = [dir.path().join("missing"), shorter, changed, original];
        assert_eq!(find_match(&incoming, &candidates[..3])?, None);
        assert_eq!(find_match(&incoming, &candidates)?, Some(3));
        Ok(())
    }
}
