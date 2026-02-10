fn main() {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        use std::env;
        use std::path::PathBuf;

        println!("cargo:rerun-if-changed=src/swift/FolderPicker.swift");

        let out_dir = env::var("OUT_DIR").unwrap();
        let target = env::var("TARGET").unwrap();
        let out_path = PathBuf::from(&out_dir);
        let swift_file = "src/swift/FolderPicker.swift";
        let lib_name = "FolderPicker";
        let lib_path = out_path.join(format!("lib{}.a", lib_name));

        // Map Rust target to Swift target
        let swift_target = if target.contains("x86_64") {
            "x86_64-apple-macosx14.0"
        } else if target.contains("aarch64") {
            "arm64-apple-macosx14.0"
        } else {
            panic!("Unsupported target architecture: {}", target);
        };

        let status = Command::new("swiftc")
            .args(&[
                "-emit-library", 
                "-static", 
                "-target", swift_target,
                "-o", lib_path.to_str().unwrap(), 
                swift_file
            ])
            .status()
            .expect("Failed to run swiftc");

        if !status.success() {
            panic!("swiftc failed");
        }

        // Find Swift library path
        let swiftc_path_output = Command::new("xcrun")
            .args(&["-f", "swiftc"])
            .output()
            .expect("Failed to find swiftc");
        
        let swiftc_path = String::from_utf8(swiftc_path_output.stdout).unwrap();
        let swiftc_path = swiftc_path.trim();
        let swift_lib_path = std::path::Path::new(swiftc_path)
            .parent().unwrap() // bin
            .parent().unwrap() // usr
            .join("lib/swift/macosx");

        println!("cargo:rustc-link-search=native={}", out_dir);
        println!("cargo:rustc-link-search=native={}", swift_lib_path.display());
        println!("cargo:rustc-link-lib=static={}", lib_name);
    }

    tauri_build::build()
}
