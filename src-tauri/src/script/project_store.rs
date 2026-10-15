use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{bail, Context, Result};
use serde::Serialize;
use sha2::{Digest, Sha256};

use super::{
    paths::{
        validate_entry_file, validate_project_id, ScriptPaths, ENTRY_FILE_NAME, MANIFEST_FILE_NAME,
    },
    types::{ProjectId, ProjectManifest, PROJECT_MANIFEST_SCHEMA_VERSION},
};

const DEFAULT_SOURCE: &str =
    "createImageProcess(async (dtm) => {\n    // Start creating here.\n});\n";
static UNIQUE_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredProject {
    pub manifest: ProjectManifest,
    pub source: String,
}

pub trait AtomicFileWriter: Send + Sync {
    fn replace(&self, destination: &Path, contents: &[u8]) -> Result<()>;
}

#[derive(Debug, Default)]
pub struct FsAtomicFileWriter;

impl AtomicFileWriter for FsAtomicFileWriter {
    fn replace(&self, destination: &Path, contents: &[u8]) -> Result<()> {
        let parent = destination
            .parent()
            .context("atomic file destination has no parent directory")?;
        let mut temporary = tempfile::Builder::new()
            .prefix(".dtm-write-")
            .tempfile_in(parent)
            .with_context(|| format!("failed to stage write in {}", parent.display()))?;
        temporary.write_all(contents).with_context(|| {
            format!("failed to write staged file for {}", destination.display())
        })?;
        temporary
            .as_file()
            .sync_all()
            .with_context(|| format!("failed to sync staged file for {}", destination.display()))?;
        temporary
            .persist(destination)
            .map_err(|error| error.error)
            .with_context(|| format!("failed to atomically replace {}", destination.display()))?;
        sync_directory(parent)?;
        Ok(())
    }
}

#[derive(Clone)]
pub struct ProjectStore {
    paths: ScriptPaths,
    writer: Arc<dyn AtomicFileWriter>,
}

impl ProjectStore {
    pub fn new(app_data_root: impl Into<PathBuf>) -> Self {
        Self::with_writer(app_data_root, Arc::new(FsAtomicFileWriter))
    }

    pub fn with_writer(
        app_data_root: impl Into<PathBuf>,
        writer: Arc<dyn AtomicFileWriter>,
    ) -> Self {
        Self {
            paths: ScriptPaths::new(app_data_root),
            writer,
        }
    }

    pub fn paths(&self) -> &ScriptPaths {
        &self.paths
    }

    pub fn create(&self, display_name: &str) -> Result<StoredProject> {
        validate_display_name(display_name)?;
        let projects_root = self
            .paths
            .validated_projects_root(true)?
            .context("script projects root was not created")?;

        for _ in 0..32 {
            let project_id = generate_project_id();
            let project_dir = projects_root.join(&project_id.0);
            if project_dir.exists() {
                continue;
            }
            let staging = tempfile::Builder::new()
                .prefix(".dtm-project-")
                .tempdir_in(&projects_root)
                .with_context(|| {
                    format!(
                        "failed to stage script project in {}",
                        projects_root.display()
                    )
                })?;
            let manifest = ProjectManifest {
                schema_version: PROJECT_MANIFEST_SCHEMA_VERSION,
                project_id,
                display_name: display_name.to_owned(),
                entry_file: ENTRY_FILE_NAME.to_owned(),
            };
            self.initialize_project(staging.path(), &manifest)?;
            let staging_path = staging.keep();
            match fs::rename(&staging_path, &project_dir) {
                Ok(()) => {
                    sync_directory(&projects_root)?;
                    return Ok(StoredProject {
                        manifest,
                        source: DEFAULT_SOURCE.to_owned(),
                    });
                }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    let _ = fs::remove_dir_all(staging_path);
                    continue;
                }
                Err(error) => {
                    let _ = fs::remove_dir_all(staging_path);
                    return Err(error).with_context(|| {
                        format!("failed to publish script project {}", project_dir.display())
                    });
                }
            }
        }
        bail!("failed to allocate a unique script project ID after 32 attempts")
    }

    pub fn list(&self) -> Result<Vec<ProjectManifest>> {
        let Some(root) = self.paths.validated_projects_root(false)? else {
            return Ok(Vec::new());
        };
        let entries =
            fs::read_dir(&root).with_context(|| format!("failed to list {}", root.display()))?;
        let mut manifests = Vec::new();
        for entry in entries {
            let entry =
                entry.with_context(|| format!("failed to read an entry in {}", root.display()))?;
            if !entry
                .file_type()
                .with_context(|| {
                    format!(
                        "failed to inspect script project entry {}",
                        entry.path().display()
                    )
                })?
                .is_dir()
            {
                continue;
            }
            let name = entry.file_name();
            let Some(id) = name.to_str() else { continue };
            if id.starts_with(".dtm-project-") {
                continue;
            }
            let project_id = ProjectId(id.to_owned());
            validate_project_id(&project_id)
                .with_context(|| format!("invalid project directory in {}", root.display()))?;
            manifests.push(self.read_manifest(&entry.path(), &project_id)?);
        }
        manifests.sort_by(|left, right| {
            left.display_name
                .cmp(&right.display_name)
                .then(left.project_id.0.cmp(&right.project_id.0))
        });
        Ok(manifests)
    }

    pub fn open(&self, project_id: &ProjectId) -> Result<StoredProject> {
        let directory = self.existing_project_dir(project_id)?;
        let manifest = self.read_manifest(&directory, project_id)?;
        let source_path = directory.join(ENTRY_FILE_NAME);
        ensure_regular_file(&source_path, "script source")?;
        let source = fs::read_to_string(&source_path)
            .with_context(|| format!("failed to read script source {}", source_path.display()))?;
        Ok(StoredProject { manifest, source })
    }

    pub fn save(&self, project_id: &ProjectId, source: &str) -> Result<()> {
        let directory = self.existing_project_dir(project_id)?;
        self.read_manifest(&directory, project_id)?;
        self.writer
            .replace(&directory.join(ENTRY_FILE_NAME), source.as_bytes())
            .with_context(|| format!("failed to save script project {}", project_id.0))
    }

    pub fn rename(&self, project_id: &ProjectId, display_name: &str) -> Result<ProjectManifest> {
        validate_display_name(display_name)?;
        let directory = self.existing_project_dir(project_id)?;
        let mut manifest = self.read_manifest(&directory, project_id)?;
        manifest.display_name = display_name.to_owned();
        self.write_manifest(&directory, &manifest)?;
        Ok(manifest)
    }

    /// Copies only the two portable MVP files into a newly-created directory.
    pub fn export(&self, project_id: &ProjectId, destination: &Path) -> Result<()> {
        let project = self.open(project_id)?;
        if destination.exists() {
            bail!(
                "export destination already exists: {}",
                destination.display()
            );
        }
        let parent = destination
            .parent()
            .context("export destination has no parent")?;
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create export parent {}", parent.display()))?;
        let staging = tempfile::Builder::new()
            .prefix(".dtm-export-")
            .tempdir_in(parent)
            .with_context(|| format!("failed to stage export in {}", parent.display()))?;
        let manifest = serde_json::to_vec_pretty(&project.manifest)
            .context("failed to serialize script project manifest for export")?;
        write_new_file(&staging.path().join(MANIFEST_FILE_NAME), &manifest)?;
        write_new_file(
            &staging.path().join(ENTRY_FILE_NAME),
            project.source.as_bytes(),
        )?;
        let staging_path = staging.keep();
        if let Err(error) = fs::rename(&staging_path, destination) {
            let _ = fs::remove_dir_all(&staging_path);
            return Err(error).with_context(|| {
                format!("failed to publish script export {}", destination.display())
            });
        }
        sync_directory(parent)?;
        Ok(())
    }

    fn initialize_project(&self, directory: &Path, manifest: &ProjectManifest) -> Result<()> {
        write_new_file(&directory.join(ENTRY_FILE_NAME), DEFAULT_SOURCE.as_bytes())?;
        let result = self.write_manifest(directory, manifest);
        if result.is_ok() {
            sync_directory(directory)?;
        }
        result
    }

    fn existing_project_dir(&self, project_id: &ProjectId) -> Result<PathBuf> {
        validate_project_id(project_id)?;
        let root = self
            .paths
            .validated_projects_root(false)?
            .context("script projects root does not exist")?;
        Ok(root.join(&project_id.0))
    }

    fn write_manifest(&self, directory: &Path, manifest: &ProjectManifest) -> Result<()> {
        let mut encoded = serde_json::to_vec_pretty(manifest)
            .context("failed to serialize script project manifest")?;
        encoded.push(b'\n');
        self.writer
            .replace(&directory.join(MANIFEST_FILE_NAME), &encoded)
    }

    fn read_manifest(&self, directory: &Path, expected_id: &ProjectId) -> Result<ProjectManifest> {
        ensure_directory(directory, "script project")?;
        let path = directory.join(MANIFEST_FILE_NAME);
        ensure_regular_file(&path, "script project manifest")?;
        let bytes = fs::read(&path).with_context(|| {
            format!("failed to read script project manifest {}", path.display())
        })?;
        let manifest: ProjectManifest = serde_json::from_slice(&bytes)
            .with_context(|| format!("malformed script project manifest {}", path.display()))?;
        if manifest.schema_version != PROJECT_MANIFEST_SCHEMA_VERSION {
            bail!(
                "unsupported script project schema version {} in {} (this DTM supports version {})",
                manifest.schema_version,
                path.display(),
                PROJECT_MANIFEST_SCHEMA_VERSION
            );
        }
        validate_project_id(&manifest.project_id)?;
        if &manifest.project_id != expected_id {
            bail!(
                "script project manifest ID does not match directory ID in {}",
                path.display()
            );
        }
        validate_display_name(&manifest.display_name)?;
        validate_entry_file(&manifest.entry_file)?;
        Ok(manifest)
    }
}

fn validate_display_name(display_name: &str) -> Result<()> {
    if display_name.trim().is_empty()
        || display_name.len() > 200
        || display_name.chars().any(char::is_control)
    {
        bail!("script project display name must be 1-200 characters without control characters");
    }
    Ok(())
}

fn ensure_directory(path: &Path, description: &str) -> Result<()> {
    let metadata = fs::symlink_metadata(path)
        .with_context(|| format!("failed to inspect {description} {}", path.display()))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        bail!(
            "{description} path is not a real directory: {}",
            path.display()
        );
    }
    Ok(())
}

fn ensure_regular_file(path: &Path, description: &str) -> Result<()> {
    let metadata = fs::symlink_metadata(path)
        .with_context(|| format!("failed to inspect {description} {}", path.display()))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        bail!(
            "{description} path is not a regular file: {}",
            path.display()
        );
    }
    Ok(())
}

fn write_new_file(path: &Path, contents: &[u8]) -> Result<()> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .with_context(|| format!("failed to create {}", path.display()))?;
    file.write_all(contents)
        .with_context(|| format!("failed to write {}", path.display()))?;
    file.sync_all()
        .with_context(|| format!("failed to sync {}", path.display()))
}

fn sync_directory(path: &Path) -> Result<()> {
    File::open(path)?
        .sync_all()
        .with_context(|| format!("failed to sync directory {}", path.display()))
}

fn generate_project_id() -> ProjectId {
    let mut hasher = Sha256::new();
    hasher.update(std::process::id().to_le_bytes());
    hasher.update(UNIQUE_COUNTER.fetch_add(1, Ordering::Relaxed).to_le_bytes());
    hasher.update(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
            .to_le_bytes(),
    );
    let mut bytes: [u8; 16] = hasher.finalize()[..16].try_into().unwrap_or([0; 16]);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    ProjectId(format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7], bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;

    struct FailingWriter;
    impl AtomicFileWriter for FailingWriter {
        fn replace(&self, destination: &Path, contents: &[u8]) -> Result<()> {
            let parent = destination.parent().unwrap();
            let mut staged = tempfile::NamedTempFile::new_in(parent)?;
            staged.write_all(contents)?;
            Err(io::Error::other("injected failure before rename").into())
        }
    }

    #[test]
    fn create_open_save_rename_and_list_round_trip() {
        let temp = tempfile::tempdir().unwrap();
        let store = ProjectStore::new(temp.path());
        let created = store.create("First").unwrap();
        validate_project_id(&created.manifest.project_id).unwrap();
        assert_eq!(store.open(&created.manifest.project_id).unwrap(), created);

        store
            .save(&created.manifest.project_id, "const changed = true;\n")
            .unwrap();
        let renamed = store
            .rename(&created.manifest.project_id, "Renamed")
            .unwrap();
        assert_eq!(renamed.display_name, "Renamed");
        let opened = store.open(&created.manifest.project_id).unwrap();
        assert_eq!(opened.source, "const changed = true;\n");
        assert_eq!(store.list().unwrap(), vec![renamed]);
    }

    #[test]
    fn failed_atomic_save_keeps_previous_source() {
        let temp = tempfile::tempdir().unwrap();
        let normal = ProjectStore::new(temp.path());
        let project = normal.create("Stable").unwrap();
        normal
            .save(&project.manifest.project_id, "previous\n")
            .unwrap();
        let failing = ProjectStore::with_writer(temp.path(), Arc::new(FailingWriter));
        let error = failing
            .save(&project.manifest.project_id, "replacement\n")
            .unwrap_err();
        assert!(error.to_string().contains("failed to save"));
        assert_eq!(
            normal.open(&project.manifest.project_id).unwrap().source,
            "previous\n"
        );
    }

    #[test]
    fn malformed_traversing_and_mismatched_manifests_fail_closed() {
        let temp = tempfile::tempdir().unwrap();
        let store = ProjectStore::new(temp.path());
        assert!(store.open(&ProjectId("../escape".into())).is_err());
        let project = store.create("Project").unwrap();
        let manifest_path = store
            .paths
            .project_dir(&project.manifest.project_id)
            .unwrap()
            .join(MANIFEST_FILE_NAME);
        fs::write(&manifest_path, b"not json").unwrap();
        assert!(store
            .open(&project.manifest.project_id)
            .unwrap_err()
            .to_string()
            .contains("malformed"));

        let mut manifest = project.manifest.clone();
        manifest.entry_file = "../process.ts".into();
        fs::write(&manifest_path, serde_json::to_vec(&manifest).unwrap()).unwrap();
        assert!(store.open(&project.manifest.project_id).is_err());

        manifest.entry_file = ENTRY_FILE_NAME.into();
        manifest.project_id = ProjectId("550e8400-e29b-41d4-a716-446655440000".into());
        fs::write(&manifest_path, serde_json::to_vec(&manifest).unwrap()).unwrap();
        let error = store
            .open(&project.manifest.project_id)
            .unwrap_err()
            .to_string();
        assert!(error.contains("manifest ID does not match directory ID"));
    }

    #[cfg(unix)]
    #[test]
    fn project_and_source_symlinks_fail_closed() {
        use std::os::unix::fs::symlink;

        let temp = tempfile::tempdir().unwrap();
        let store = ProjectStore::new(temp.path());
        let project = store.create("Project").unwrap();
        let directory = store
            .paths
            .project_dir(&project.manifest.project_id)
            .unwrap();
        let outside = temp.path().join("outside.ts");
        fs::write(&outside, "private").unwrap();
        fs::remove_file(directory.join(ENTRY_FILE_NAME)).unwrap();
        symlink(&outside, directory.join(ENTRY_FILE_NAME)).unwrap();
        assert!(store.open(&project.manifest.project_id).is_err());

        let linked_id = ProjectId("550e8400-e29b-41d4-a716-446655440000".into());
        symlink(&directory, store.paths.project_dir(&linked_id).unwrap()).unwrap();
        assert!(store.open(&linked_id).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn managed_directory_symlinks_cannot_escape_app_data() {
        use std::os::unix::fs::symlink;

        for linked_component in ["image-scripts", "projects"] {
            let temp = tempfile::tempdir().unwrap();
            let outside_app = temp.path().join("outside-app");
            let outside_store = ProjectStore::new(&outside_app);
            let outside_project = outside_store.create("Outside").unwrap();
            outside_store
                .save(&outside_project.manifest.project_id, "outside source\n")
                .unwrap();

            let app_data = temp.path().join("app-data");
            fs::create_dir(&app_data).unwrap();
            if linked_component == "image-scripts" {
                symlink(
                    outside_app.join("image-scripts"),
                    app_data.join("image-scripts"),
                )
                .unwrap();
            } else {
                fs::create_dir(app_data.join("image-scripts")).unwrap();
                symlink(
                    outside_app.join("image-scripts/projects"),
                    app_data.join("image-scripts/projects"),
                )
                .unwrap();
            }
            let store = ProjectStore::new(&app_data);

            assert!(store.list().is_err());
            assert!(store.open(&outside_project.manifest.project_id).is_err());
            assert!(store
                .save(&outside_project.manifest.project_id, "tampered\n")
                .is_err());
            assert!(store
                .rename(&outside_project.manifest.project_id, "Tampered")
                .is_err());
            assert!(store.create("Escaped").is_err());

            let unchanged = outside_store
                .open(&outside_project.manifest.project_id)
                .unwrap();
            assert_eq!(unchanged.source, "outside source\n");
            assert_eq!(unchanged.manifest.display_name, "Outside");
            assert_eq!(outside_store.list().unwrap().len(), 1);
        }
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_above_the_injected_app_data_root_are_supported() {
        use std::os::unix::fs::symlink;

        let temp = tempfile::tempdir().unwrap();
        let real_parent = temp.path().join("real-parent");
        fs::create_dir(&real_parent).unwrap();
        let alias_parent = temp.path().join("alias-parent");
        symlink(&real_parent, &alias_parent).unwrap();
        let app_data_via_alias = alias_parent.join("app-data");
        let store = ProjectStore::new(&app_data_via_alias);

        let project = store.create("Aliased root").unwrap();
        assert_eq!(store.open(&project.manifest.project_id).unwrap(), project);
        assert!(real_parent
            .join("app-data/image-scripts/projects")
            .join(&project.manifest.project_id.0)
            .is_dir());
    }

    #[test]
    fn unsupported_schema_error_is_actionable() {
        let temp = tempfile::tempdir().unwrap();
        let store = ProjectStore::new(temp.path());
        let project = store.create("Future").unwrap();
        let path = store
            .paths
            .project_dir(&project.manifest.project_id)
            .unwrap()
            .join(MANIFEST_FILE_NAME);
        let mut value = serde_json::to_value(&project.manifest).unwrap();
        value["schemaVersion"] = serde_json::json!(PROJECT_MANIFEST_SCHEMA_VERSION + 1);
        fs::write(path, serde_json::to_vec(&value).unwrap()).unwrap();
        let error = store
            .open(&project.manifest.project_id)
            .unwrap_err()
            .to_string();
        assert!(error.contains("unsupported script project schema version"));
        assert!(error.contains("supports version 1"));
    }

    #[test]
    fn export_contains_only_portable_files() {
        let temp = tempfile::tempdir().unwrap();
        let store = ProjectStore::new(temp.path().join("app"));
        let project = store.create("Portable").unwrap();
        let private = store
            .paths
            .private_project_dir(&project.manifest.project_id)
            .unwrap();
        fs::create_dir_all(&private).unwrap();
        fs::write(private.join("editor-state.json"), "private").unwrap();
        let export = temp.path().join("exported");
        store.export(&project.manifest.project_id, &export).unwrap();
        let mut names: Vec<_> = fs::read_dir(export)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        names.sort();
        assert_eq!(names, vec![MANIFEST_FILE_NAME, ENTRY_FILE_NAME]);
    }
}
