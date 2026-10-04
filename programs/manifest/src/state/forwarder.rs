//! `Forwarder`: a freight forwarder's profile, bond and track record
//! (PDA `["forwarder", authority]`).

use anchor_lang::prelude::*;

use crate::constants::NAME_LEN;

#[account]
#[derive(InitSpace)]
pub struct Forwarder {
    pub version: u8,
    pub bump: u8,
    pub bond_vault_bump: u8,
    /// The forwarder's wallet.
    pub authority: Pubkey,
    pub name: [u8; NAME_LEN],
    /// Chosen at registration; must be in `Config::bond_mints`.
    pub bond_mint: Pubkey,
    /// Token account PDA `["bond_vault", forwarder]`, owned by this forwarder PDA.
    pub bond_vault: Pubkey,
    /// Mirrors the bond vault balance.
    pub bond_balance: u64,
    /// Sum of coverage locked by open consignments. `bond_balance >= locked_coverage`.
    pub locked_coverage: u64,
    /// Index of the next container.
    pub container_count: u32,
    pub stats_consignments_delivered: u32,
    pub stats_on_time: u32,
    pub stats_disputes_opened: u32,
    /// Disputes resolved with a slash.
    pub stats_disputes_lost: u32,
    /// Total goods value delivered.
    pub stats_volume: u64,
    pub stats_slashed_total: u64,
    pub created_at: i64,
}
