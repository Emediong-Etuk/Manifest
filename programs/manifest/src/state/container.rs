//! `Container`: one shared container run by a forwarder
//! (PDA `["container", forwarder, index_le(u32)]`).

use anchor_lang::prelude::*;

use crate::constants::{CODE_LEN, CONTAINER_NUMBER_LEN, LOCODE_LEN};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum ContainerMode {
    Sea,
    /// Air freight is billed per kg; the UI shows kg, but storage reuses the same
    /// milli-unit fields (1 kg = 1_000).
    Air,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum ContainerStatus {
    Open,
    Closed,
    Loaded,
    Arrived,
    Completed,
    Cancelled,
}

#[account]
#[derive(InitSpace)]
pub struct Container {
    pub version: u8,
    pub bump: u8,
    /// Forwarder PDA (not the wallet).
    pub forwarder: Pubkey,
    pub index: u32,
    /// Human code, e.g. `LAG-1014`.
    pub code: [u8; CODE_LEN],
    /// UN/LOCODE, e.g. `CNCAN`.
    pub origin: [u8; LOCODE_LEN],
    pub destination: [u8; LOCODE_LEN],
    pub mode: ContainerMode,
    /// Payment mint for every consignment in this container.
    pub mint: Pubkey,
    pub capacity_cbm_milli: u32,
    /// Sum of estimates for active bookings.
    pub booked_cbm_milli: u32,
    /// Sum of measured volumes.
    pub received_cbm_milli: u32,
    /// Base units per 1 CBM.
    pub rate_per_cbm: u64,
    /// Bookings close (and goods should reach the warehouse) by this time.
    pub cutoff_ts: i64,
    /// Expected arrival at the destination port.
    pub eta_ts: i64,
    pub status: ContainerStatus,
    /// ISO 6346 container number, set at loading.
    pub container_number: [u8; CONTAINER_NUMBER_LEN],
    /// SHA-256 of the bill of lading, set at loading.
    pub bl_hash: [u8; 32],
    pub loaded_ts: i64,
    pub arrived_ts: i64,
    /// Index of the next consignment.
    pub consignment_count: u16,
    /// Booked and not refunded or rejected.
    pub active_count: u16,
    pub approved_count: u16,
    /// Delivered, settled or compensated.
    pub settled_count: u16,
}
