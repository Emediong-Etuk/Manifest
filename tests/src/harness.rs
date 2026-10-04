//! Test helpers: load the compiled program into a fresh LiteSVM instance.

use std::path::PathBuf;

use litesvm::LiteSVM;

/// Path to the program binary produced by `anchor build`.
fn program_so_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../target/deploy/manifest.so")
}

/// A LiteSVM instance with the Manifest program deployed at `manifest::ID`.
pub fn svm_with_program() -> LiteSVM {
    let path = program_so_path();
    let bytes = std::fs::read(&path).unwrap_or_else(|err| {
        panic!(
            "could not read {} ({err}); run `anchor build` before the tests",
            path.display()
        )
    });
    let mut svm = LiteSVM::new();
    svm.add_program(manifest::ID, &bytes)
        .expect("program should load into LiteSVM");
    svm
}
