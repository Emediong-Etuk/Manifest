//! refund_after_cutoff: the trader takes back everything if the goods never reached
//! the warehouse by the cut-off.
//!
//! What this does:
//! 1. Only the original trader, only while the consignment is still `Booked`, and only
//!    after the container's cut-off.
//! 2. Returns goods + fee + freight from the vault to the trader's token account.
//! 3. Frees the booked volume and the forwarder's locked coverage; status `Refunded`.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::errors::ManifestError;
use crate::events::Refunded;
use crate::instructions::shared::{release_booking, VaultAccounts};
use crate::state::{Consignment, ConsignmentStatus, Container, Forwarder};

#[derive(Accounts)]
pub struct RefundAfterCutoff<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    #[account(mut)]
    pub forwarder: Box<Account<'info, Forwarder>>,

    #[account(mut, has_one = forwarder @ ManifestError::AccountMismatch)]
    pub container: Box<Account<'info, Container>>,

    #[account(
        mut,
        has_one = container @ ManifestError::AccountMismatch,
        has_one = trader @ ManifestError::NotTrader,
        has_one = vault @ ManifestError::AccountMismatch,
        has_one = mint @ ManifestError::AccountMismatch
    )]
    pub consignment: Box<Account<'info, Consignment>>,

    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = trader,
        associated_token::mint = mint,
        associated_token::authority = trader,
        associated_token::token_program = token_program
    )]
    pub trader_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_refund_after_cutoff(ctx: Context<RefundAfterCutoff>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        ctx.accounts.consignment.status == ConsignmentStatus::Booked,
        ManifestError::InvalidConsignmentStatus
    );
    require!(
        now > ctx.accounts.container.cutoff_ts,
        ManifestError::CutoffNotReached
    );

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
    c.status = ConsignmentStatus::Refunded;
    c.freight_escrowed = 0;
    c.settled_at = now;

    emit!(Refunded {
        consignment: c.key(),
        trader: c.trader,
        amount,
        timestamp: now,
    });
    Ok(())
}
