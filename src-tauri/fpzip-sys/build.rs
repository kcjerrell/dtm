extern crate bindgen;

use cmake;
use std::env;
use std::path::PathBuf;

fn main() {
    // Build fpzip with cmake
    let fpzip = cmake::Config::new("fpzip")
        // ensure proper architecture on macOS
        .define("CMAKE_POLICY_VERSION_MINIMUM", "3.5")
        .define("CMAKE_OSX_ARCHITECTURES", "arm64")
        // build static library
        .define("BUILD_SHARED_LIBS", "OFF")
        .build();

    // Link search path
    println!("cargo:rustc-link-search=native={}/lib", fpzip.display());

    // Link fpzip static library
    println!("cargo:rustc-link-lib=static=fpzip");

    // Link C++ standard library
    println!("cargo:rustc-link-lib=c++");

    // Generate bindings
    let bindings = bindgen::Builder::default()
        .header("wrapper.h")
        .clang_arg("-I")
        .clang_arg(format!("{}/include", fpzip.display()))
        .generate()
        .expect("Unable to generate bindings");

    let out_path = PathBuf::from(env::var("OUT_DIR").unwrap());
    bindings
        .write_to_file(out_path.join("bindings.rs"))
        .expect("Couldn't write bindings!");
}