//! auto_approve: anyone can settle a consignment the trader left unreviewed.
//!
//! What this does:
//! 1. Only for a `Received` consignment whose review window has ended.
//! 2. Runs the same approval settlement as `approve_goods`; the Cargo Ticket still goes
//!    to the trader, and the caller (usually the crank) pays the rent.
//! 3. Emits `GoodsApproved { auto: true }`.

use anchor_lang::prelude::*;

use crate::errors::ManifestError;
use crate::instructions::trader::approve::{settle_approval, SettleApproval};
use crate::state::ConsignmentStatus;

pub fn handle_auto_approve(ctx: Context<SettleApproval>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let c = &ctx.accounts.consignment;
    require!(
        c.status == ConsignmentStatus::Received,
        ManifestError::InvalidConsignmentStatus
    );
    require!(now > c.review_deadline, ManifestError::ReviewWindowOpen);
    settle_approval(ctx, now, true)
}
