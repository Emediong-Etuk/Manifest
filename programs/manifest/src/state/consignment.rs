//! `Consignment`: one trader's goods in a container, and its escrow
//! (PDA `["consignment", container, index_le(u16)]`).

use anchor_lang::prelude::*;

use crate::constants::DESCRIPTION_LEN;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum ConsignmentStatus {
    Booked,
    Received,
    Approved,
    Disputed,
    Refunded,
    Rejected,
    Delivered,
    Settled,
    Compensated,
}

/// How the arbitrator settled a dispute.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Resolution {
    /// Pre-approval: refund all escrow to the trader.
    RefundEscrow,
    /// Pre-approval: run the normal approval settlement.
    ForceApprove,
    /// Return to the status before the dispute.
    Dismiss,
    /// Post-approval: compensate the ticket holder from the forwarder's bond.
    SlashBond,
}

#[account]
#[derive(InitSpace)]
pub struct Consignment {
    pub version: u8,
    pub bump: u8,
    pub vault_bump: u8,
    pub container: Pubkey,
    pub index: u16,
    /// Original booker. Refunds go here.
    pub trader: Pubkey,
    /// Supplier or agent wallet that receives the goods payment.
    pub payee: Pubkey,
    /// Equals `container.mint`.
    pub mint: Pubkey,
    /// Token account PDA `["vault", consignment]`, owned by this consignment PDA.
    pub vault: Pubkey,
    pub goods_amount: u64,
    /// `goods_amount * fee_bps / 10_000`, rounded down.
    pub fee_amount: u64,
    /// Freight currently held in the vault.
    pub freight_escrowed: u64,
    /// Set at approval from the measured volume.
    pub freight_due: u64,
    pub est_cbm_milli: u32,
    pub measured_cbm_milli: u32,
    pub carton_count: u16,
    pub description: [u8; DESCRIPTION_LEN],
    /// SHA-256 of the canonical evidence manifest.
    pub evidence_hash: [u8; 32],
    /// `goods_amount * coverage_bps / 10_000`, rounded up.
    pub coverage_locked: u64,
    pub status: ConsignmentStatus,
    /// Status before the current dispute; used by `Dismiss` resolutions.
    pub prev_status: ConsignmentStatus,
    /// 0 none, 1 wrong goods, 2 short quantity, 3 missing cartons, 4 damaged, 5 overdue, 6 other.
    pub dispute_reason: u8,
    /// `Pubkey::default()` until approval.
    pub cargo_ticket_mint: Pubkey,
    pub booked_at: i64,
    pub received_at: i64,
    pub approved_at: i64,
    pub settled_at: i64,
    /// `received_at + review_window_secs`.
    pub review_deadline: i64,
}

impl Consignment {
    /// Total currently held in the vault according to state.
    /// Before approval: goods + fee + freight. After approval: freight only.
    pub fn escrow_held(&self) -> Option<u64> {
        match self.status {
            ConsignmentStatus::Booked | ConsignmentStatus::Received => self
                .goods_amount
                .checked_add(self.fee_amount)?
                .checked_add(self.freight_escrowed),
            ConsignmentStatus::Disputed if self.prev_status == ConsignmentStatus::Received => self
                .goods_amount
                .checked_add(self.fee_amount)?
                .checked_add(self.freight_escrowed),
            _ => Some(self.freight_escrowed),
        }
    }
}
