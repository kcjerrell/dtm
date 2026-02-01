fn main() {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        use std::env;
        use std::path::PathBuf;

        println!("cargo:rerun-if-changed=src/swift/FolderPicker.swift");

        let out_dir = env::var("OUT_DIR").unwrap();
        let out_path = PathBuf::from(&out_dir);
        let swift_file = "src/swift/FolderPicker.swift";
        let lib_name = "FolderPicker";
        let lib_path = out_path.join(format!("lib{}.a", lib_name));

        let status = Command::new("swiftc")
            .args(&["-emit-library", "-static", "-o", lib_path.to_str().unwrap(), swift_file])
            .status()
            .expect("Failed to run swiftc");

        if !status.success() {
            panic!("swiftc failed");
        }

        println!("cargo:rustc-link-search=native={}", out_dir);
        println!("cargo:rustc-link-lib=static={}", lib_name);
    }

    tauri_build::build()
}
