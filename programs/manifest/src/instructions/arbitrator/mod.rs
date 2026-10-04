//! Arbitrator instructions (`config.arbitrator`, a Squads vault on devnet).
//!
//! The spec's single `resolve_dispute(resolution)` is split into one instruction per
//! resolution, because each needs a different set of accounts:
//! `resolve_refund_escrow`, `resolve_force_approve`, `resolve_dismiss`, `resolve_slash_bond`.

pub mod resolve;

pub use resolve::*;
