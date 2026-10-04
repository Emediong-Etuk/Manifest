//! `Config`: the singleton protocol configuration (PDA `["config"]`).

use anchor_lang::prelude::*;

use crate::constants::{MAX_MINTS, METADATA_BASE_URI_LEN};

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub version: u8,
    pub bump: u8,
    /// Bump of the `["ticket_authority"]` PDA, cached so instructions don't re-derive it.
    pub ticket_authority_bump: u8,
    /// Can update config and pause. Changed only through `transfer_admin`.
    pub admin: Pubkey,
    /// Resolves disputes. A Squads vault PDA on devnet.
    pub arbitrator: Pubkey,
    /// Owner of the fee token accounts. A Squads vault PDA on devnet.
    pub treasury_owner: Pubkey,
    /// Allowed escrow mints. `Pubkey::default()` marks an empty slot.
    pub payment_mints: [Pubkey; MAX_MINTS],
    /// Allowed bond mints. `Pubkey::default()` marks an empty slot.
    pub bond_mints: [Pubkey; MAX_MINTS],
    pub fee_bps: u16,
    pub coverage_bps: u16,
    pub freight_buffer_bps: u16,
    pub review_window_secs: i64,
    pub pickup_grace_secs: i64,
    pub dispute_window_secs: i64,
    pub overdue_grace_secs: i64,
    pub on_time_grace_secs: i64,
    /// Cargo Ticket metadata URI prefix; the consignment pubkey (base58) is appended.
    pub metadata_base_uri: [u8; METADATA_BASE_URI_LEN],
    /// Blocks new containers and bookings. Never blocks refunds, approvals or claims.
    pub paused: bool,
}

impl Config {
    pub fn is_payment_mint(&self, mint: &Pubkey) -> bool {
        *mint != Pubkey::default() && self.payment_mints.contains(mint)
    }

    pub fn is_bond_mint(&self, mint: &Pubkey) -> bool {
        *mint != Pubkey::default() && self.bond_mints.contains(mint)
    }
}

/// Every settable field of `Config` (everything except `admin` and bumps).
/// Used by both `initialize_config` and `update_config`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConfigParams {
    pub arbitrator: Pubkey,
    pub treasury_owner: Pubkey,
    pub payment_mints: [Pubkey; MAX_MINTS],
    pub bond_mints: [Pubkey; MAX_MINTS],
    pub fee_bps: u16,
    pub coverage_bps: u16,
    pub freight_buffer_bps: u16,
    pub review_window_secs: i64,
    pub pickup_grace_secs: i64,
    pub dispute_window_secs: i64,
    pub overdue_grace_secs: i64,
    pub on_time_grace_secs: i64,
    pub metadata_base_uri: [u8; METADATA_BASE_URI_LEN],
    pub paused: bool,
}
