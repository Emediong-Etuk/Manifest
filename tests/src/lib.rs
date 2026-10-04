//! LiteSVM integration tests for the Manifest program.
//!
//! LiteSVM runs the compiled SBF program in-process, so tests are fast and can
//! warp the clock to exercise deadlines. `harness` wraps LiteSVM; `fixtures` builds a
//! standard world and drives each instruction.

// LiteSVM's failure type is large; boxing it in test helpers would only add noise.
#![allow(clippy::result_large_err)]

#[cfg(test)]
mod harness;

#[cfg(test)]
mod fixtures;

#[cfg(test)]
mod admin;

#[cfg(test)]
mod forwarder;

#[cfg(test)]
mod container;

#[cfg(test)]
mod smoke;
