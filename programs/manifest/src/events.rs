//! Anchor events, emitted on every state transition so indexers and the app can follow
//! the lifecycle from transaction logs. Phase 2 adds the post-loading events.

use anchor_lang::prelude::*;

#[event]
pub struct ConfigUpdated {
    pub admin: Pubkey,
    pub paused: bool,
    pub timestamp: i64,
}

#[event]
pub struct AdminTransferred {
    pub old_admin: Pubkey,
    pub new_admin: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ForwarderRegistered {
    pub forwarder: Pubkey,
    pub authority: Pubkey,
    pub bond_mint: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct BondDeposited {
    pub forwarder: Pubkey,
    pub amount: u64,
    pub bond_balance: u64,
    pub timestamp: i64,
}

#[event]
pub struct BondWithdrawn {
    pub forwarder: Pubkey,
    pub amount: u64,
    pub bond_balance: u64,
    pub timestamp: i64,
}

#[event]
pub struct ContainerOpened {
    pub container: Pubkey,
    pub forwarder: Pubkey,
    pub index: u32,
    pub mint: Pubkey,
    pub capacity_cbm_milli: u32,
    pub rate_per_cbm: u64,
    pub cutoff_ts: i64,
    pub eta_ts: i64,
    pub timestamp: i64,
}

#[event]
pub struct BookingClosed {
    pub container: Pubkey,
    pub closed_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ContainerCancelled {
    pub container: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ConsignmentBooked {
    pub consignment: Pubkey,
    pub container: Pubkey,
    pub trader: Pubkey,
    pub payee: Pubkey,
    pub goods_amount: u64,
    pub fee_amount: u64,
    pub freight_escrowed: u64,
    pub est_cbm_milli: u32,
    pub coverage_locked: u64,
    pub timestamp: i64,
}

#[event]
pub struct BookingRejected {
    pub consignment: Pubkey,
    pub container: Pubkey,
    pub refunded: u64,
    pub timestamp: i64,
}

#[event]
pub struct Refunded {
    pub consignment: Pubkey,
    pub trader: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct ReceiptRecorded {
    pub consignment: Pubkey,
    pub container: Pubkey,
    pub evidence_hash: [u8; 32],
    pub measured_cbm_milli: u32,
    pub carton_count: u16,
    pub review_deadline: i64,
    pub timestamp: i64,
}

#[event]
pub struct GoodsApproved {
    pub consignment: Pubkey,
    pub container: Pubkey,
    pub payee: Pubkey,
    pub goods_paid: u64,
    pub fee_paid: u64,
    pub freight_due: u64,
    pub freight_refunded: u64,
    /// True when approved by `auto_approve` after the review window.
    pub auto: bool,
    pub timestamp: i64,
}

#[event]
pub struct CargoTicketMinted {
    pub consignment: Pubkey,
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct GoodsRejected {
    pub consignment: Pubkey,
    pub container: Pubkey,
    pub reason: u8,
    pub timestamp: i64,
}

#[event]
pub struct FreightToppedUp {
    pub consignment: Pubkey,
    pub payer: Pubkey,
    pub amount: u64,
    pub freight_escrowed: u64,
    pub timestamp: i64,
}

#[event]
pub struct ContainerLoaded {
    pub container: Pubkey,
    pub container_number: [u8; 11],
    pub bl_hash: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct ContainerArrived {
    pub container: Pubkey,
    pub on_time: bool,
    pub timestamp: i64,
}

#[event]
pub struct ContainerCompleted {
    pub container: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct PickupConfirmed {
    pub consignment: Pubkey,
    pub holder: Pubkey,
    pub freight_paid: u64,
    pub excess_refunded: u64,
    pub on_time: bool,
    pub timestamp: i64,
}

#[event]
pub struct FreightClaimed {
    pub consignment: Pubkey,
    pub holder: Pubkey,
    pub freight_paid: u64,
    pub excess_refunded: u64,
    pub timestamp: i64,
}

#[event]
pub struct DisputeOpened {
    pub consignment: Pubkey,
    pub holder: Pubkey,
    pub reason: u8,
    pub timestamp: i64,
}

#[event]
pub struct DisputeResolved {
    pub consignment: Pubkey,
    pub resolution: crate::state::Resolution,
    /// Refunded (RefundEscrow) or slashed (SlashBond) amount; 0 otherwise.
    pub amount: u64,
    pub timestamp: i64,
}
