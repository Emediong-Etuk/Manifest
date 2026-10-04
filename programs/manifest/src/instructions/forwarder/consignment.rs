//! reject_booking / record_receipt: the forwarder's actions on a single consignment.
//!
//! What this does:
//! 1. reject_booking: the forwarder declines a `Booked` consignment; the trader gets
//!    goods + fee + freight back and the volume and coverage are freed.
//! 2. record_receipt: goods arrived at the origin warehouse. The forwarder writes the
//!    SHA-256 of the evidence manifest (photos, packing list), the measured volume and
//!    carton count, and the trader's review window starts.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::{CONFIG_SEED, FORWARDER_SEED};
use crate::errors::ManifestError;
use crate::events::{BookingRejected, ReceiptRecorded};
use crate::instructions::shared::{release_booking, VaultAccounts};
use crate::state::{Config, Consignment, ConsignmentStatus, Container, ContainerStatus, Forwarder};

#[derive(Accounts)]
pub struct RejectBooking<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [FORWARDER_SEED, authority.key().as_ref()],
        bump = forwarder.bump,
        has_one = authority @ ManifestError::NotForwarder
    )]
    pub forwarder: Box<Account<'info, Forwarder>>,

    #[account(mut, has_one = forwarder @ ManifestError::AccountMismatch)]
    pub container: Box<Account<'info, Container>>,

    #[account(
        mut,
        has_one = container @ ManifestError::AccountMismatch,
        has_one = trader @ ManifestError::AccountMismatch,
        has_one = vault @ ManifestError::AccountMismatch,
        has_one = mint @ ManifestError::AccountMismatch
    )]
    pub consignment: Box<Account<'info, Consignment>>,

    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: the consignment's trader (checked by `has_one = trader`); refund recipient.
    pub trader: UncheckedAccount<'info>,

    /// The forwarder pays rent if the trader's associated token account doesn't exist.
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = trader,
        associated_token::token_program = token_program
    )]
    pub trader_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_reject_booking(ctx: Context<RejectBooking>) -> Result<()> {
    require!(
        ctx.accounts.consignment.status == ConsignmentStatus::Booked,
        ManifestError::InvalidConsignmentStatus
    );
    let now = Clock::get()?.unix_timestamp;

    let a = &ctx.accounts;
    let amount = a
        .consignment
        .escrow_held()
        .ok_or_else(|| error!(ManifestError::MathOverflow))?;
    VaultAccounts {
        token_program: &a.token_program.to_account_info(),
        vault: &a.vault.to_account_info(),
        mint: &a.mint.to_account_info(),
        consignment: &a.consignment.to_account_info(),
        decimals: a.mint.decimals,
    }
    .pay(
        &a.consignment,
        &a.trader_token_account.to_account_info(),
        amount,
    )?;

    let a = &mut *ctx.accounts;
    release_booking(&mut a.container, &mut a.forwarder, &a.consignment)?;
    let c = &mut a.consignment;
    c.status = ConsignmentStatus::Rejected;
    c.freight_escrowed = 0;
    c.settled_at = now;

    emit!(BookingRejected {
        consignment: c.key(),
        container: c.container,
        refunded: amount,
        timestamp: now,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct RecordReceipt<'info> {
    pub authority: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        seeds = [FORWARDER_SEED, authority.key().as_ref()],
        bump = forwarder.bump,
        has_one = authority @ ManifestError::NotForwarder
    )]
    pub forwarder: Box<Account<'info, Forwarder>>,

    #[account(mut, has_one = forwarder @ ManifestError::AccountMismatch)]
    pub container: Box<Account<'info, Container>>,

    #[account(mut, has_one = container @ ManifestError::AccountMismatch)]
    pub consignment: Box<Account<'info, Consignment>>,
}

pub fn handle_record_receipt(
    ctx: Context<RecordReceipt>,
    evidence_hash: [u8; 32],
    measured_cbm_milli: u32,
    carton_count: u16,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let container = &mut ctx.accounts.container;
    let c = &mut ctx.accounts.consignment;

    require!(
        c.status == ConsignmentStatus::Booked,
        ManifestError::InvalidConsignmentStatus
    );
    require!(
        matches!(
            container.status,
            ContainerStatus::Open | ContainerStatus::Closed
        ),
        ManifestError::InvalidContainerStatus
    );
    require!(
        measured_cbm_milli > 0 && carton_count > 0 && evidence_hash != [0u8; 32],
        ManifestError::InvalidReceipt
    );
    let received = container
        .received_cbm_milli
        .checked_add(measured_cbm_milli)
        .ok_or_else(|| error!(ManifestError::CapacityExceeded))?;
    require!(
        received <= container.capacity_cbm_milli,
        ManifestError::CapacityExceeded
    );
    let review_deadline = now
        .checked_add(ctx.accounts.config.review_window_secs)
        .ok_or_else(|| error!(ManifestError::MathOverflow))?;

    container.received_cbm_milli = received;
    c.evidence_hash = evidence_hash;
    c.measured_cbm_milli = measured_cbm_milli;
    c.carton_count = carton_count;
    c.received_at = now;
    c.review_deadline = review_deadline;
    c.status = ConsignmentStatus::Received;

    emit!(ReceiptRecorded {
        consignment: c.key(),
        container: c.container,
        evidence_hash,
        measured_cbm_milli,
        carton_count,
        review_deadline,
        timestamp: now,
    });
    Ok(())
}
