//! reject_goods: the trader disputes the goods shown in the warehouse evidence.
//!
//! What this does:
//! 1. Only the original trader, only while `Received` and within the review window.
//! 2. Records the reason (1 wrong goods, 2 short quantity, 3 missing cartons,
//!    4 damaged, 5 overdue, 6 other) and remembers the previous status.
//! 3. Status `Disputed`; escrow stays locked until the arbitrator resolves it.

use anchor_lang::prelude::*;

use crate::constants::{DISPUTE_REASON_MAX, DISPUTE_REASON_NONE};
use crate::errors::ManifestError;
use crate::events::GoodsRejected;
use crate::state::{Consignment, ConsignmentStatus, Container, Forwarder};

#[derive(Accounts)]
pub struct RejectGoods<'info> {
    pub trader: Signer<'info>,

    #[account(mut)]
    pub forwarder: Box<Account<'info, Forwarder>>,

    #[account(has_one = forwarder @ ManifestError::AccountMismatch)]
    pub container: Box<Account<'info, Container>>,

    #[account(
        mut,
        has_one = container @ ManifestError::AccountMismatch,
        has_one = trader @ ManifestError::NotTrader
    )]
    pub consignment: Box<Account<'info, Consignment>>,
}

pub fn handle_reject_goods(ctx: Context<RejectGoods>, reason: u8) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        reason > DISPUTE_REASON_NONE && reason <= DISPUTE_REASON_MAX,
        ManifestError::InvalidDisputeReason
    );
    let c = &mut ctx.accounts.consignment;
    require!(
        c.status == ConsignmentStatus::Received,
        ManifestError::InvalidConsignmentStatus
    );
    require!(now <= c.review_deadline, ManifestError::ReviewWindowClosed);

    c.prev_status = ConsignmentStatus::Received;
    c.status = ConsignmentStatus::Disputed;
    c.dispute_reason = reason;

    let forwarder = &mut ctx.accounts.forwarder;
    forwarder.stats_disputes_opened = forwarder
        .stats_disputes_opened
        .checked_add(1)
        .ok_or_else(|| error!(ManifestError::CounterOverflow))?;

    emit!(GoodsRejected {
        consignment: c.key(),
        container: c.container,
        reason,
        timestamp: now,
    });
    Ok(())
}
