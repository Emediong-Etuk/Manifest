//! Manifest: a programmable letter of credit for shared-container importers.
//!
//! Funds sit in per-consignment escrow vaults and move only when the milestone
//! they pay for is proven. Forwarders post a slashable bond before they can
//! take bookings, and every approved consignment mints a transferable Cargo
//! Ticket (a Token-2022 NFT) that carries pickup and dispute rights.
//!
//! The full specification lives in `MANIFEST_BUILD_PROMPT.md` section 5.
//! Instructions are added phase by phase; see `PROGRESS.md`.

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

declare_id!("HQHe42ZUBWmrSbjW4zr9Qt2wdGDYyH1QpiYLJe3z7Jci");

#[program]
pub mod manifest {}
