use std::fs;
use std::path::Path;
use std::process::Command;

fn main() {
    // Download vec0 dylib files if missing
    download_vec0_dylibs();

    #[cfg(target_os = "macos")]
    {
        println!("cargo:rerun-if-changed=src/objc/FolderPicker.m");

        cc::Build::new()
            .file("src/objc/FolderPicker.m")
            .flag("-fobjc-arc")
            .compile("FolderPicker");

        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=AppKit");
    }

    tauri_build::build()
}

fn download_vec0_dylibs() -> Result<(), Box<dyn std::error::Error>> {
    let resources_dir = Path::new("resources/vec");
    let universal_dylib = resources_dir.join("vec0.dylib");

    if universal_dylib.exists() {
        return Ok(());
    }

    fs::create_dir_all(resources_dir)?;

    let temp_dir = resources_dir.join("tmp");
    fs::create_dir_all(&temp_dir)?;

    let x86_dylib = temp_dir.join("vec0-x86_64.dylib");
    let arm_dylib = temp_dir.join("vec0-aarch64.dylib");

    if !x86_dylib.exists() {
        download_and_extract(
            "https://github.com/asg017/sqlite-vec/releases/download/v0.1.10-alpha.4/sqlite-vec-0.1.10-alpha.4-loadable-macos-x86_64.tar.gz",
            &x86_dylib,
            "vec0.dylib",
        )?;
    }

    if !arm_dylib.exists() {
        download_and_extract(
            "https://github.com/asg017/sqlite-vec/releases/download/v0.1.10-alpha.4/sqlite-vec-0.1.10-alpha.4-loadable-macos-aarch64.tar.gz",
            &arm_dylib,
            "vec0.dylib",
        )
        .expect("failed to download arm sqlite-vec");
    }

    let status = Command::new("lipo")
        .args([
            "-create",
            x86_dylib.to_str().unwrap(),
            arm_dylib.to_str().unwrap(),
            "-output",
            universal_dylib.to_str().unwrap(),
        ])
        .status()
        .expect("failed to execute lipo");

    assert!(status.success(), "lipo failed");

    fs::remove_dir_all(temp_dir)?;
    
    Ok(())
}

fn download_and_extract(
    url: &str,
    dest: &Path,
    dylib_name: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let response = attohttpc::get(url).send()?;
    let bytes = response.bytes()?;

    // Decode gzipped tar archive
    let decoder = flate2::read::GzDecoder::new(&bytes[..]);
    let mut archive = tar::Archive::new(decoder);

    // Extract the dylib file
    for entry in archive.entries()? {
        let mut entry = entry?;
        let path = entry.path()?;
        if path.file_name() == Some(std::ffi::OsStr::new(dylib_name)) {
            entry.unpack(dest)?;
            return Ok(());
        }
    }

    Err(format!("{} not found in archive", dylib_name).into())
}
