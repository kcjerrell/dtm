use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
};

use anyhow::{bail, Context, Result};

use super::types::ProjectId;

pub const MANIFEST_FILE_NAME: &str = "dtm.json";
pub const ENTRY_FILE_NAME: &str = "process.ts";

/// All script paths derived from an injected application-data directory.
///
/// Portable project files and DTM-private state deliberately have disjoint roots.
#[derive(Debug, Clone)]
pub struct ScriptPaths {
    app_data_root: PathBuf,
}

impl ScriptPaths {
    pub fn new(app_data_root: impl Into<PathBuf>) -> Self {
        Self {
            app_data_root: app_data_root.into(),
        }
    }

    pub fn projects_root(&self) -> PathBuf {
        self.app_data_root.join("image-scripts").join("projects")
    }

    pub fn private_root(&self) -> PathBuf {
        self.app_data_root.join("image-scripts").join("private")
    }

    pub fn project_dir(&self, project_id: &ProjectId) -> Result<PathBuf> {
        validate_project_id(project_id)?;
        Ok(self.projects_root().join(&project_id.0))
    }

    pub fn private_project_dir(&self, project_id: &ProjectId) -> Result<PathBuf> {
        validate_project_id(project_id)?;
        Ok(self.private_root().join(&project_id.0))
    }

    /// Resolves the projects root beneath the canonical injected app-data
    /// directory, rejecting symlinks in every app-managed path component.
    /// Symlinks in ancestors of the injected root remain valid.
    pub fn validated_projects_root(&self, create: bool) -> Result<Option<PathBuf>> {
        self.validated_managed_root("projects", create)
    }

    /// Resolves the private-state root using the same containment rules as the
    /// portable project root.
    pub fn validated_private_root(&self, create: bool) -> Result<Option<PathBuf>> {
        self.validated_managed_root("private", create)
    }

    fn validated_managed_root(&self, leaf: &str, create: bool) -> Result<Option<PathBuf>> {
        if create {
            fs::create_dir_all(&self.app_data_root).with_context(|| {
                format!(
                    "failed to create script app-data root {}",
                    self.app_data_root.display()
                )
            })?;
        } else if !self.app_data_root.exists() {
            return Ok(None);
        }

        let canonical_app_data = fs::canonicalize(&self.app_data_root).with_context(|| {
            format!(
                "failed to canonicalize script app-data root {}",
                self.app_data_root.display()
            )
        })?;
        let image_scripts = canonical_app_data.join("image-scripts");
        if !ensure_managed_directory(&image_scripts, create)? {
            return Ok(None);
        }
        let managed_root = image_scripts.join(leaf);
        if !ensure_managed_directory(&managed_root, create)? {
            return Ok(None);
        }

        let canonical_managed = fs::canonicalize(&managed_root).with_context(|| {
            format!(
                "failed to canonicalize managed root {}",
                managed_root.display()
            )
        })?;
        if !canonical_managed.starts_with(&canonical_app_data) {
            bail!(
                "managed script path escapes app-data root: {}",
                managed_root.display()
            );
        }
        Ok(Some(canonical_managed))
    }
}

fn ensure_managed_directory(path: &Path, create: bool) -> Result<bool> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == ErrorKind::NotFound && !create => return Ok(false),
        Err(error) if error.kind() == ErrorKind::NotFound => {
            fs::create_dir(path).with_context(|| {
                format!(
                    "failed to create managed script directory {}",
                    path.display()
                )
            })?;
            fs::symlink_metadata(path).with_context(|| {
                format!(
                    "failed to inspect managed script directory {}",
                    path.display()
                )
            })?
        }
        Err(error) => {
            return Err(error).with_context(|| {
                format!(
                    "failed to inspect managed script directory {}",
                    path.display()
                )
            })
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        bail!(
            "managed script path is not a real directory: {}",
            path.display()
        );
    }
    Ok(true)
}

/// Accept only canonical, lowercase UUID text. This makes joining an ID to a
/// storage root safe and avoids multiple on-disk spellings of the same ID.
pub fn validate_project_id(project_id: &ProjectId) -> Result<()> {
    let value = project_id.0.as_bytes();
    if value.len() != 36
        || value.iter().enumerate().any(|(index, byte)| match index {
            8 | 13 | 18 | 23 => *byte != b'-',
            _ => !byte.is_ascii_digit() && !(b'a'..=b'f').contains(byte),
        })
    {
        bail!(
            "invalid script project ID {:?}: expected a canonical lowercase UUID",
            project_id.0
        );
    }
    Ok(())
}

pub fn validate_entry_file(entry_file: &str) -> Result<()> {
    if entry_file != ENTRY_FILE_NAME || Path::new(entry_file).components().count() != 1 {
        bail!("invalid script project entry file {entry_file:?}: expected {ENTRY_FILE_NAME}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_ids_cannot_traverse_or_use_noncanonical_forms() {
        for invalid in [
            "../escape",
            "/absolute",
            "550E8400-E29B-41D4-A716-446655440000",
            "550e8400-e29b-41d4-a716-44665544000g",
            "550e8400e29b41d4a716446655440000",
        ] {
            assert!(validate_project_id(&ProjectId(invalid.into())).is_err());
        }

        validate_project_id(&ProjectId("550e8400-e29b-41d4-a716-446655440000".into())).unwrap();
    }

    #[test]
    fn portable_and_private_roots_are_separate() {
        let paths = ScriptPaths::new("/app-data");
        let id = ProjectId("550e8400-e29b-41d4-a716-446655440000".into());
        assert_eq!(
            paths.project_dir(&id).unwrap(),
            Path::new("/app-data/image-scripts/projects").join(&id.0)
        );
        assert_eq!(
            paths.private_project_dir(&id).unwrap(),
            Path::new("/app-data/image-scripts/private").join(&id.0)
        );
    }
}
