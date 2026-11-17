//! Portable dependency metadata and generated, project-local installation generations.
use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::{ErrorKind, Read, Write},
    path::{Path, PathBuf},
};

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tempfile::TempDir;

use super::bun_probe::compilation_target_triple;

pub(super) const PACKAGE_FILE: &str = "package.json";
pub(super) const LOCK_FILE: &str = "bun.lock";
const STORE: &str = ".dtm-packages";
const CURRENT: &str = "current";
const INSTALL_STAMP: &str = ".dtm-install";
const GENERATION_PREFIX: &str = "generation-";
const MANIFEST_LIMIT: u64 = 128 * 1024;
const LOCK_LIMIT: u64 = 16 * 1024 * 1024;

pub type ScriptDependencies = BTreeMap<String, String>;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptDependencyStatus {
    pub dependencies: ScriptDependencies,
    pub revision: Option<String>,
    pub lock_fingerprint: Option<String>,
    pub installed: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScriptLifecycleApproval {
    pub lock_fingerprint: String,
    pub packages: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ExpectedPackageState {
    pub(super) revision: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackageManifest {
    name: String,
    private: bool,
    dependencies: ScriptDependencies,
    trusted_dependencies: Vec<String>,
}

impl PackageManifest {
    fn new(dependencies: ScriptDependencies) -> Self {
        Self {
            name: "dtm-image-script".to_owned(),
            private: true,
            dependencies,
            trusted_dependencies: Vec::new(),
        }
    }

    fn validate(&self) -> Result<()> {
        if self.name != "dtm-image-script" || !self.private || !self.trusted_dependencies.is_empty()
        {
            bail!("script package manifest contains unsupported settings");
        }
        validate_dependencies(&self.dependencies)
    }
}

pub(super) fn validate_dependencies(dependencies: &ScriptDependencies) -> Result<()> {
    if dependencies.len() > 128 {
        bail!("script projects support up to 128 direct dependencies");
    }
    for (name, version) in dependencies {
        if !valid_package_name(name) {
            bail!("invalid npm package name {name:?}");
        }
        if version.len() > 128 || semver::Version::parse(version).is_err() {
            bail!("dependency {name} requires an exact npm version");
        }
    }
    Ok(())
}

fn valid_package_name(name: &str) -> bool {
    fn valid_part(part: &str) -> bool {
        matches!(part.as_bytes().first(), Some(b'a'..=b'z' | b'0'..=b'9'))
            && part.bytes().all(|byte| {
                byte.is_ascii_lowercase()
                    || byte.is_ascii_digit()
                    || matches!(byte, b'.' | b'_' | b'-')
            })
    }

    name.len() <= 214
        && if let Some(scope_and_name) = name.strip_prefix('@') {
            scope_and_name
                .split_once('/')
                .is_some_and(|(scope, package)| valid_part(scope) && valid_part(package))
        } else {
            valid_part(name)
        }
}

pub(super) struct PackageGeneration {
    path: PathBuf,
    name: String,
    manifest: Vec<u8>,
    lock: Vec<u8>,
    dependencies: ScriptDependencies,
}

impl PackageGeneration {
    pub(super) fn portable_files(&self) -> [(&'static str, &[u8]); 2] {
        [(PACKAGE_FILE, &self.manifest), (LOCK_FILE, &self.lock)]
    }

    pub(super) fn status(&self) -> ScriptDependencyStatus {
        ScriptDependencyStatus {
            dependencies: self.dependencies.clone(),
            revision: Some(self.revision()),
            lock_fingerprint: Some(self.lock_fingerprint()),
            installed: self.installed_modules().is_ok(),
        }
    }

    pub(super) fn revision(&self) -> String {
        format!("{}:{}", self.name, self.lock_fingerprint())
    }

    fn lock_fingerprint(&self) -> String {
        lock_fingerprint(&self.manifest, &self.lock)
    }

    pub(super) fn approved_packages(
        &self,
        approval: &ScriptLifecycleApproval,
    ) -> Result<Vec<String>> {
        if approval.lock_fingerprint != self.lock_fingerprint() {
            bail!("the package lock changed before lifecycle script approval; review it and retry");
        }
        if approval.packages.is_empty() || approval.packages.len() > self.dependencies.len() {
            bail!("choose one or more locked direct dependencies for lifecycle script approval");
        }
        let mut names = approval.packages.clone();
        for name in &names {
            if !self.dependencies.contains_key(name) {
                bail!("lifecycle script approval requires a locked direct dependency: {name:?}");
            }
        }
        names.sort_unstable();
        names.dedup();
        Ok(names)
    }

    pub(super) fn verify_staged_modules(&self, stage: &Path) -> Result<PathBuf> {
        verify_modules(stage, &self.dependencies)
    }

    pub(super) fn installed_modules(&self) -> Result<PathBuf> {
        let target =
            compilation_target_triple().context("packages are unavailable on this target")?;
        let stamp = read_file(&self.path.join(INSTALL_STAMP), 128)
            .context("package install is missing; restore the locked dependencies")?;
        let expected = format!("{target}:{}", self.lock_fingerprint());
        if stamp != expected.as_bytes() {
            bail!("package install does not match this platform and lock; restore the locked dependencies");
        }
        verify_modules(&self.path, &self.dependencies)
            .context("package install is incomplete; restore the locked dependencies")
    }
}

/// Prevents updates while another DTM process is using or exporting this generation.
#[derive(Debug)]
pub(super) struct PackageAccess {
    project: PathBuf,
    lock: File,
}

impl PackageAccess {
    pub(super) fn open(project: PathBuf, write: bool) -> Result<Self> {
        let root = project.join(STORE);
        match fs::create_dir(&root) {
            Err(error) if error.kind() == ErrorKind::AlreadyExists => (),
            result => result.with_context(|| format!("failed to create {}", root.display()))?,
        }
        real_directory(&root)?;
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
        }
        let lock = options
            .open(root.join(".lock"))
            .context("failed to open script package lock")?;
        if !lock.metadata()?.is_file() {
            bail!("script package lock is not a regular file");
        }
        if write {
            lock.try_lock()
        } else {
            lock.try_lock_shared()
        }
        .context("script packages are in use; stop the run or wait for the installation")?;
        Ok(Self { project, lock })
    }

    pub(super) fn current(&self) -> Result<Option<PackageGeneration>> {
        current(&self.project)
    }

    pub(super) fn stage(&self) -> Result<TempDir> {
        let root = self.project.join(STORE);
        tempfile::Builder::new()
            .prefix(GENERATION_PREFIX)
            .tempdir_in(&root)
            .context("failed to stage script package installation")
    }

    /// One atomic pointer selects the manifest, lockfile and installed modules together.
    /// The caller serializes publication with run admission and same-project execution.
    pub(super) fn publish(
        &self,
        stage: Option<TempDir>,
    ) -> Result<(ScriptDependencyStatus, Option<PathBuf>)> {
        let root = self.project.join(STORE);
        let previous = match self.current() {
            Ok(generation) => generation,
            Err(error) => {
                log::warn!("Replacing invalid script package metadata: {error:#}");
                None
            }
        };
        let pointer = root.join(CURRENT);
        let status = if let Some(stage) = stage {
            let name = stage
                .path()
                .file_name()
                .and_then(|name| name.to_str())
                .context("missing package generation name")?;
            let generation = read_generation(&root, name)?;
            generation.installed_modules()?;
            let status = generation.status();
            // Sync the portable metadata and the generation directory before making it current.
            for file in [PACKAGE_FILE, LOCK_FILE, INSTALL_STAMP] {
                File::open(stage.path().join(file))?.sync_all()?;
            }
            File::open(stage.path())?.sync_all()?;
            let mut temporary = tempfile::NamedTempFile::new_in(&root)?;
            temporary.write_all(name.as_bytes())?;
            temporary.as_file().sync_all()?;
            temporary
                .persist(&pointer)
                .map_err(|error| error.error)
                .context("failed to publish script package generation")?;
            let _ = stage.keep();
            status
        } else {
            match fs::remove_file(&pointer) {
                Err(error) if error.kind() == ErrorKind::NotFound => (),
                result => result.context("failed to remove script project dependencies")?,
            }
            ScriptDependencyStatus::default()
        };
        // Publication has happened. Retain the live generation even if directory sync fails.
        let obsolete = match File::open(&root).and_then(|directory| directory.sync_all()) {
            Ok(()) => previous.map(|previous| previous.path),
            Err(error) => {
                log::warn!("Failed to sync script package storage: {error}");
                None
            }
        };
        Ok((status, obsolete))
    }
}

impl Drop for PackageAccess {
    fn drop(&mut self) {
        // Another thread can fork a child while this file is open. Unlock even if
        // that child briefly inherited the descriptor before its close-on-exec.
        if let Err(error) = self.lock.unlock() {
            log::warn!("Failed to release script package storage lock: {error}");
        }
    }
}

fn current(project: &Path) -> Result<Option<PackageGeneration>> {
    let root = project.join(STORE);
    match fs::symlink_metadata(&root) {
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        result => {
            if !result?.is_dir() {
                bail!("script package storage is not a real directory");
            }
        }
    }
    let pointer = root.join(CURRENT);
    match fs::symlink_metadata(&pointer) {
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        result => result?,
    };
    let name = String::from_utf8(read_file(&pointer, 128)?)
        .context("script package generation pointer is not UTF-8")?;
    Ok(Some(read_generation(&root, &name)?))
}

fn read_generation(root: &Path, name: &str) -> Result<PackageGeneration> {
    if !name.strip_prefix(GENERATION_PREFIX).is_some_and(|suffix| {
        !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_alphanumeric())
    }) {
        bail!("invalid script package generation pointer");
    }
    let path = root.join(name);
    real_directory(&path)?;
    let manifest = read_file(&path.join(PACKAGE_FILE), MANIFEST_LIMIT)?;
    let parsed: PackageManifest =
        serde_json::from_slice(&manifest).context("invalid script package manifest")?;
    parsed.validate()?;
    if parsed.dependencies.is_empty() {
        bail!("script package generation has no dependencies");
    }
    let lock = read_file(&path.join(LOCK_FILE), LOCK_LIMIT)?;
    if lock.is_empty() {
        bail!("script package generation has an empty lockfile");
    }
    Ok(PackageGeneration {
        path,
        name: name.to_owned(),
        manifest,
        lock,
        dependencies: parsed.dependencies,
    })
}

pub(super) fn write_manifest(path: &Path, dependencies: ScriptDependencies) -> Result<()> {
    let manifest = PackageManifest::new(dependencies);
    manifest.validate()?;
    fs::write(
        path.join(PACKAGE_FILE),
        serde_json::to_vec_pretty(&manifest)?,
    )
    .context("failed to write staged script package manifest")
}

fn lock_fingerprint(manifest: &[u8], lock: &[u8]) -> String {
    let mut digest = Sha256::new();
    digest.update((manifest.len() as u64).to_le_bytes());
    digest.update(manifest);
    digest.update(lock);
    hex::encode(digest.finalize())
}

pub(super) fn stamp_modules(path: &Path) -> Result<()> {
    let target = compilation_target_triple().context("packages are unavailable on this target")?;
    let manifest = read_file(&path.join(PACKAGE_FILE), MANIFEST_LIMIT)?;
    let lock = read_file(&path.join(LOCK_FILE), LOCK_LIMIT)?;
    let stamp = format!("{target}:{}", lock_fingerprint(&manifest, &lock));
    fs::write(path.join(INSTALL_STAMP), stamp)
        .context("failed to record script package installation")
}

fn real_directory(path: &Path) -> Result<()> {
    if !fs::symlink_metadata(path)
        .with_context(|| {
            format!(
                "failed to inspect script package directory {}",
                path.display()
            )
        })?
        .is_dir()
    {
        bail!(
            "script package path is not a real directory: {}",
            path.display()
        );
    }
    Ok(())
}

pub(super) fn read_file(path: &Path, maximum: u64) -> Result<Vec<u8>> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    if !fs::symlink_metadata(path)
        .with_context(|| format!("failed to inspect {}", path.display()))?
        .is_file()
    {
        bail!(
            "script package path is not a regular file: {}",
            path.display()
        );
    }
    let file = options
        .open(path)
        .with_context(|| format!("failed to open {}", path.display()))?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.len() > maximum {
        bail!(
            "invalid script package file type or size: {}",
            path.display()
        );
    }
    let mut bytes = Vec::new();
    file.take(maximum + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > maximum {
        bail!(
            "script package file exceeds {maximum} bytes: {}",
            path.display()
        );
    }
    Ok(bytes)
}

fn verify_modules(path: &Path, dependencies: &ScriptDependencies) -> Result<PathBuf> {
    let modules = path.join("node_modules");
    real_directory(&modules)?;
    for (name, version) in dependencies {
        if let Some((scope, _)) = name.split_once('/') {
            real_directory(&modules.join(scope))?;
        }
        let directory = modules.join(name);
        real_directory(&directory).with_context(|| {
            format!("dependency {name}@{version} is absent or unsupported on this platform")
        })?;
        let manifest = read_file(&directory.join(PACKAGE_FILE), MANIFEST_LIMIT)?;
        let actual: InstalledPackage = serde_json::from_slice(&manifest)
            .with_context(|| format!("invalid installed manifest for {name}@{version}"))?;
        if actual.name != *name || actual.version != *version {
            bail!("installed package metadata does not match locked dependency {name}@{version}");
        }
        let os = if cfg!(target_os = "macos") {
            "darwin"
        } else {
            std::env::consts::OS
        };
        let cpu = match std::env::consts::ARCH {
            "aarch64" => "arm64",
            "x86_64" => "x64",
            other => other,
        };
        if !matches_platform(&actual.os, os)
            || !matches_platform(&actual.cpu, cpu)
            || (cfg!(target_os = "linux") && !matches_platform(&actual.libc, "glibc"))
        {
            bail!("dependency {name}@{version} is unsupported on this platform");
        }
    }
    Ok(modules)
}

#[derive(Deserialize)]
struct InstalledPackage {
    name: String,
    version: String,
    #[serde(default, deserialize_with = "platform_rules")]
    cpu: Vec<String>,
    #[serde(default, deserialize_with = "platform_rules")]
    os: Vec<String>,
    #[serde(default, deserialize_with = "platform_rules")]
    libc: Vec<String>,
}

fn platform_rules<'de, D>(deserializer: D) -> std::result::Result<Vec<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum PlatformRules {
        One(String),
        Many(Vec<String>),
    }

    Ok(match Option::<PlatformRules>::deserialize(deserializer)? {
        Some(PlatformRules::One(rule)) => vec![rule],
        Some(PlatformRules::Many(rules)) => rules,
        None => Vec::new(),
    })
}

fn matches_platform(rules: &[String], value: &str) -> bool {
    if rules
        .iter()
        .any(|rule| rule.strip_prefix('!') == Some(value))
    {
        return false;
    }
    rules.iter().all(|rule| rule.starts_with('!'))
        || rules.iter().any(|rule| rule == value || rule == "any")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn package_platform_metadata_accepts_scalar_and_array_constraints() {
        let parsed: InstalledPackage = serde_json::from_str(
            r#"{"name":"example","version":"1.0.0","cpu":["any","!x64"],"os":["!win32"],"libc":"glibc"}"#,
        ).unwrap();
        assert!(matches_platform(&parsed.cpu, "arm64"));
        assert!(!matches_platform(&parsed.cpu, "x64"));
        assert!(matches_platform(&parsed.os, "darwin"));
        assert!(!matches_platform(&parsed.os, "win32"));
        assert!(matches_platform(&parsed.libc, "glibc"));
        assert!(!matches_platform(&parsed.libc, "musl"));
    }
}
