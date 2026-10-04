//! Phase 0 smoke test: the harness can deploy the program.

use crate::harness::svm_with_program;

#[test]
fn program_deploys_as_executable_account() {
    let svm = svm_with_program();
    let account = svm
        .get_account(&manifest::ID)
        .expect("program account should exist");
    assert!(account.executable);
}
