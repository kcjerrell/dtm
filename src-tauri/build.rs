fn main() {
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
