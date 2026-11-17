use std::{fs, path::Path};

use anyhow::{bail, Context, Result};
use serde::Serialize;
use walkdir::WalkDir;

use super::{packages::read_file, project_store::ProjectStore, types::ProjectId};

const MAX_FILES: usize = 4096;
const MAX_ENTRIES: usize = 50_000;
const MAX_BYTES: u64 = 8 * 1024 * 1024;
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Serialize)]
pub struct PackageDeclarations {
    revision: String,
    files: Vec<DeclarationFile>,
    truncated: bool,
}

#[derive(Serialize)]
struct DeclarationFile {
    path: String,
    content: String,
}

pub(super) fn installed_declarations(
    store: &ProjectStore,
    project: &ProjectId,
    expected_revision: &str,
) -> Result<PackageDeclarations> {
    // Hold the read lease until the snapshot is complete so an install cannot replace it.
    let packages = store.package_access(project, false)?;
    let generation = packages
        .current()?
        .context("script project has no locked dependencies")?;
    let revision = generation.revision();
    if revision != expected_revision {
        bail!("script package revision changed before loading editor declarations");
    }
    let modules = generation.installed_modules()?;
    collect_declarations(&modules, revision)
}

fn collect_declarations(modules: &Path, revision: String) -> Result<PackageDeclarations> {
    let mut declarations = PackageDeclarations {
        revision,
        files: Vec::new(),
        truncated: false,
    };
    let mut bytes_left = MAX_BYTES;
    // Include nested and hoisted dependencies in their original layout. Package manifests retain
    // their original key order because it affects conditional exports resolution.
    let entries = WalkDir::new(modules)
        .min_depth(1)
        .follow_links(false)
        .sort_by_file_name()
        .into_iter()
        .filter_entry(|entry| !(entry.file_type().is_dir() && entry.file_name() == ".bin"));
    for (position, entry) in entries.enumerate() {
        if position >= MAX_ENTRIES {
            declarations.truncated = true;
            break;
        }
        let entry = entry.context("failed to scan script package declarations")?;
        if !entry.file_type().is_file() || !is_editor_file(entry.path()) {
            continue;
        }
        if declarations.files.len() >= MAX_FILES {
            declarations.truncated = true;
            break;
        }
        let relative = entry.path().strip_prefix(modules)?;
        let Some(relative) = relative.to_str() else {
            declarations.truncated = true;
            continue;
        };
        let maximum = MAX_FILE_BYTES.min(bytes_left);
        let length = fs::symlink_metadata(entry.path())?.len();
        if length > maximum {
            declarations.truncated = true;
            continue;
        }
        let contents = read_file(entry.path(), maximum)?;
        bytes_left -= contents.len() as u64;
        let Ok(content) = String::from_utf8(contents) else {
            declarations.truncated = true;
            continue;
        };
        declarations.files.push(DeclarationFile {
            path: format!("node_modules/{relative}"),
            content,
        });
    }
    Ok(declarations)
}

fn is_editor_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            name == "package.json"
                || [".d.ts", ".d.cts", ".d.mts"]
                    .iter()
                    .any(|suffix| name.ends_with(suffix))
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::script::packages::{stamp_modules, write_manifest};

    #[test]
    fn loads_only_installed_declarations_and_resolution_metadata_for_the_reviewed_revision() {
        let root = tempfile::tempdir().unwrap();
        let store = ProjectStore::new(root.path());
        let project = store
            .create("Declaration test")
            .unwrap()
            .manifest
            .project_id;
        let access = store.package_access(&project, true).unwrap();
        let stage = access.stage().unwrap();
        write_manifest(stage.path(), [("@demo/pkg".into(), "1.0.0".into())].into()).unwrap();
        fs::write(stage.path().join("bun.lock"), b"fixture lock").unwrap();

        let package = stage.path().join("node_modules/@demo/pkg");
        let transitive = package.join("node_modules/transitive");
        fs::create_dir_all(&transitive).unwrap();
        let manifest = r#"{"name":"@demo/pkg","version":"1.0.0","exports":{".":{"types":"./index.d.mts","default":"./index.js"}}}"#;
        fs::write(package.join("package.json"), manifest).unwrap();
        fs::write(package.join("index.d.mts"), "export * from 'transitive'").unwrap();
        fs::write(package.join("index.js"), "throw new Error('executable')").unwrap();
        fs::write(transitive.join("index.d.cts"), "export type Item = string").unwrap();
        #[cfg(unix)]
        {
            let outside = root.path().join("outside.d.ts");
            fs::write(&outside, "private file").unwrap();
            std::os::unix::fs::symlink(outside, package.join("linked.d.ts")).unwrap();
        }
        stamp_modules(stage.path()).unwrap();
        let (status, _) = access.publish(Some(stage)).unwrap();
        let revision = status.revision.unwrap();
        drop(access);

        assert!(installed_declarations(&store, &project, "obsolete").is_err());
        let declarations = installed_declarations(&store, &project, &revision).unwrap();
        assert_eq!(declarations.revision, revision);
        assert!(!declarations.truncated);
        assert_eq!(
            declarations
                .files
                .iter()
                .map(|file| file.path.as_str())
                .collect::<Vec<_>>(),
            [
                "node_modules/@demo/pkg/index.d.mts",
                "node_modules/@demo/pkg/node_modules/transitive/index.d.cts",
                "node_modules/@demo/pkg/package.json",
            ]
        );
        assert_eq!(declarations.files[2].content, manifest);
    }

    #[test]
    fn oversized_declarations_are_skipped_and_reported() {
        let root = tempfile::tempdir().unwrap();
        fs::File::create(root.path().join("oversized.d.ts"))
            .unwrap()
            .set_len(MAX_FILE_BYTES + 1)
            .unwrap();
        fs::write(root.path().join("small.d.ts"), "export {}").unwrap();
        let result = collect_declarations(root.path(), "current".into()).unwrap();
        assert!(result.truncated);
        assert_eq!(result.files.len(), 1);
        assert_eq!(result.files[0].path, "node_modules/small.d.ts");
    }
}
