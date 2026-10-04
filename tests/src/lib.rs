//! LiteSVM integration tests for the Manifest program.
//!
//! LiteSVM runs the compiled SBF program in-process, so tests are fast and can
//! warp the clock to exercise deadlines. Shared helpers live in `harness`.

#[cfg(test)]
mod harness;

#[cfg(test)]
mod smoke;
