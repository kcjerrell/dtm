extern crate bindgen;

use cmake;
use std::env;
use std::path::PathBuf;

fn main() {
    //build fpzip with cmake
    let fpzip = cmake::Config::new("fpzip")
        .define("CMAKE_POLICY_VERSION_MINIMUM", "3.5")
        .build();

    println!("cargo:rustc-link-search=native={}/lib", fpzip.display());
    println!("cargo:rustc-link-search=native={}/lib64", fpzip.display());
    println!("cargo:rustc-link-lib=fpzip");

    // The bindgen::Builder is the main entry point
    // to bindgen, and lets you build up options for
    // the resulting bindings.
    let bindings = bindgen::Builder::default()
        // The input header we would like to generate
        // bindings for.
        .header("wrapper.h")
        // add the location of the fpzip header file
        .clang_arg("-I")
        .clang_arg(format!("{}/include", fpzip.display()))
        // Finish the builder and generate the bindings.
        .generate()
        // Unwrap the Result and panic on failure.
        .expect("Unable to generate bindings");

    // Write the bindings to the $OUT_DIR/bindings.rs file.
    let out_path = PathBuf::from(env::var("OUT_DIR").unwrap());
    bindings
        .write_to_file(out_path.join("bindings.rs"))
        .expect("Couldn't write bindings!");
}
