//! Dispute resolution by the arbitrator.
//!
//! What this does:
//! 1. RefundEscrow (dispute raised before approval): return goods + fee + freight to the
//!    trader and free the booking. Status `Refunded`.
//! 2. ForceApprove (before approval): run the normal approval settlement (supplier paid,
//!    Cargo Ticket minted). Reuses the `SettleApproval` accounts with the arbitrator as payer.
//! 3. Dismiss (either stage): return to the status before the dispute.
//! 4. SlashBond (after approval): pay the ticket holder `min(amount, goods, bond)` from
//!    the forwarder's bond, refund remaining freight to the holder, burn the ticket with the
//!    program's permanent-delegate authority. Status `Compensated`.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::{CONFIG_SEED, FORWARDER_SEED, TICKET_AUTHORITY_SEED};
use crate::errors::ManifestError;
use crate::events::DisputeResolved;
use crate::instructions::shared::{finish_consignment, release_booking, VaultAccounts};
use crate::instructions::trader::approve::{settle_approval, SettleApproval};
use crate::state::{Config, Consignment, ConsignmentStatus, Container, Forwarder, Resolution};
use crate::utils::cargo_ticket::burn_ticket;
use crate::utils::{math, token};

fn require_disputed(c: &Consignment, stage: ConsignmentStatus) -> Result<()> {
    require!(
        c.status == ConsignmentStatus::Disputed,
        ManifestError::InvalidConsignmentStatus
    );
    require!(c.prev_status == stage, ManifestError::InvalidResolution);
    Ok(())
}

// ------------------------------------------------------------------ RefundEscrow

#[derive(Accounts)]
pub struct ResolveRefundEscrow<'info> {
    #[account(mut)]
    pub arbitrator: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = arbitrator @ ManifestError::NotArbitrator
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(mut)]
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

    /// CHECK: the consignment's trader (`has_one`); refund recipient.
    pub trader: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = arbitrator,
        associated_token::mint = mint,
        associated_token::authority = trader,
        associated_token::token_program = token_program
    )]
    pub trader_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_resolve_refund_escrow(ctx: Context<ResolveRefundEscrow>) -> Result<()> {
    require_disputed(&ctx.accounts.consignment, ConsignmentStatus::Received)?;
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
    // The goods were measured into the container; free that volume too.
    a.container.received_cbm_milli = a
        .container
        .received_cbm_milli
        .checked_sub(a.consignment.measured_cbm_milli)
        .ok_or_else(|| error!(ManifestError::CounterOverflow))?;
    let c = &mut a.consignment;
    c.status = ConsignmentStatus::Refunded;
    c.freight_escrowed = 0;
    c.settled_at = now;

    emit!(DisputeResolved {
        consignment: c.key(),
        resolution: Resolution::RefundEscrow,
        amount,
        timestamp: now,
    });
    Ok(())
}

// ------------------------------------------------------------------ ForceApprove

/// Uses the approval settlement accounts; the arbitrator signs as `payer`.
pub fn handle_resolve_force_approve(ctx: Context<SettleApproval>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.payer.key(),
        ctx.accounts.config.arbitrator,
        ManifestError::NotArbitrator
    );
    require_disputed(&ctx.accounts.consignment, ConsignmentStatus::Received)?;
    let now = Clock::get()?.unix_timestamp;
    let consignment = ctx.accounts.consignment.key();
    settle_approval(ctx, now, false)?;
    emit!(DisputeResolved {
        consignment,
        resolution: Resolution::ForceApprove,
        amount: 0,
        timestamp: now,
    });
    Ok(())
}

// ------------------------------------------------------------------ Dismiss

#[derive(Accounts)]
pub struct ResolveDismiss<'info> {
    pub arbitrator: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = arbitrator @ ManifestError::NotArbitrator
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(mut)]
    pub consignment: Box<Account<'info, Consignment>>,
}

pub fn handle_resolve_dismiss(ctx: Context<ResolveDismiss>) -> Result<()> {
    let c = &mut ctx.accounts.consignment;
    require!(
        c.status == ConsignmentStatus::Disputed,
        ManifestError::InvalidConsignmentStatus
    );
    c.status = c.prev_status;
    let now = Clock::get()?.unix_timestamp;
    emit!(DisputeResolved {
        consignment: c.key(),
        resolution: Resolution::Dismiss,
        amount: 0,
        timestamp: now,
    });
    Ok(())
}

// ------------------------------------------------------------------ SlashBond

#[derive(Accounts)]
pub struct ResolveSlashBond<'info> {
    #[account(mut)]
    pub arbitrator: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = arbitrator @ ManifestError::NotArbitrator
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        has_one = bond_mint @ ManifestError::AccountMismatch,
        has_one = bond_vault @ ManifestError::AccountMismatch
    )]
    pub forwarder: Box<Account<'info, Forwarder>>,

    #[account(mut, has_one = forwarder @ ManifestError::AccountMismatch)]
    pub container: Box<Account<'info, Container>>,

    #[account(
        mut,
        has_one = container @ ManifestError::AccountMismatch,
        has_one = vault @ ManifestError::AccountMismatch,
        has_one = mint @ ManifestError::AccountMismatch,
        has_one = cargo_ticket_mint @ ManifestError::AccountMismatch
    )]
    pub consignment: Box<Account<'info, Consignment>>,

    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mint::token_program = bond_token_program)]
    pub bond_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut)]
    pub bond_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: the current ticket holder, read from `holder_ticket_account`.
    #[account(address = holder_ticket_account.owner @ ManifestError::NotTicketHolder)]
    pub holder: UncheckedAccount<'info>,

    /// Receives the remaining freight escrow (payment mint).
    #[account(
        init_if_needed,
        payer = arbitrator,
        associated_token::mint = mint,
        associated_token::authority = holder,
        associated_token::token_program = token_program
    )]
    pub holder_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Receives the slashed bond when the bond mint differs from the payment mint.
    /// Pass `None` when they are the same mint (the payment account above is used).
    /// Must already exist; clients prepend an idempotent ATA-creation instruction.
    #[account(
        mut,
        associated_token::mint = bond_mint,
        associated_token::authority = holder,
        associated_token::token_program = bond_token_program
    )]
    pub holder_bond_token_account: Option<Box<InterfaceAccount<'info, TokenAccount>>>,

    #[account(mut, mint::token_program = token_2022_program)]
    pub cargo_ticket_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = cargo_ticket_mint,
        token::token_program = token_2022_program,
        constraint = holder_ticket_account.amount == 1 @ ManifestError::NotTicketHolder
    )]
    pub holder_ticket_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: PDA `["ticket_authority"]`, the ticket's permanent delegate.
    #[account(seeds = [TICKET_AUTHORITY_SEED], bump = config.ticket_authority_bump)]
    pub ticket_authority: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub bond_token_program: Interface<'info, TokenInterface>,
    pub token_2022_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_resolve_slash_bond(ctx: Context<ResolveSlashBond>, amount: u64) -> Result<()> {
    require!(amount > 0, ManifestError::ZeroAmount);
    require_disputed(&ctx.accounts.consignment, ConsignmentStatus::Approved)?;
    let now = Clock::get()?.unix_timestamp;

    // Pay at most the goods value and never more than the bond holds. A slash can leave
    // the bond below the coverage still locked by other open consignments (invariant 3's
    // documented exception); new bookings and withdrawals are then blocked until the
    // forwarder tops the bond back up.
    let a = &ctx.accounts;
    let paid = amount
        .min(a.consignment.goods_amount)
        .min(a.forwarder.bond_balance);

    // Where the slashed bond goes: the payment-mint account if the mints match,
    // otherwise the holder's bond-mint account.
    let same_mint = a.bond_mint.key() == a.mint.key();
    let bond_destination = if same_mint {
        require!(
            a.holder_bond_token_account.is_none(),
            ManifestError::AccountMismatch
        );
        a.holder_token_account.to_account_info()
    } else {
        a.holder_bond_token_account
            .as_ref()
            .ok_or_else(|| error!(ManifestError::AccountMismatch))?
            .to_account_info()
    };

    // 1. Bond vault -> holder, signed by the forwarder PDA (the vault's owner).
    let authority = a.forwarder.authority;
    let forwarder_seeds: &[&[u8]] = &[FORWARDER_SEED, authority.as_ref(), &[a.forwarder.bump]];
    token::transfer(
        &a.bond_token_program.to_account_info(),
        &a.bond_vault.to_account_info(),
        &a.bond_mint.to_account_info(),
        &bond_destination,
        &a.forwarder.to_account_info(),
        paid,
        a.bond_mint.decimals,
        &[forwarder_seeds],
    )?;

    // 2. Remaining freight escrow -> holder.
    let c = &a.consignment;
    VaultAccounts {
        token_program: &a.token_program.to_account_info(),
        vault: &a.vault.to_account_info(),
        mint: &a.mint.to_account_info(),
        consignment: &a.consignment.to_account_info(),
        decimals: a.mint.decimals,
    }
    .pay(
        c,
        &a.holder_token_account.to_account_info(),
        c.freight_escrowed,
    )?;

    // 3. Burn the ticket with the program's permanent-delegate authority. This is the
    //    second of the two documented uses of that authority.
    let ticket_bump = [a.config.ticket_authority_bump];
    let ticket_seeds: &[&[u8]] = &[TICKET_AUTHORITY_SEED, &ticket_bump];
    burn_ticket(
        &a.token_2022_program.to_account_info(),
        &a.cargo_ticket_mint.to_account_info(),
        &a.holder_ticket_account.to_account_info(),
        &a.ticket_authority.to_account_info(),
        &[ticket_seeds],
    )?;

    let a = &mut *ctx.accounts;
    finish_consignment(&mut a.container, &mut a.forwarder, &a.consignment, now)?;
    let f = &mut a.forwarder;
    f.bond_balance = math::sub(f.bond_balance, paid)?;
    f.stats_disputes_lost = f
        .stats_disputes_lost
        .checked_add(1)
        .ok_or_else(|| error!(ManifestError::CounterOverflow))?;
    f.stats_slashed_total = math::add(f.stats_slashed_total, paid)?;
    let c = &mut a.consignment;
    c.freight_escrowed = 0;
    c.settled_at = now;
    c.status = ConsignmentStatus::Compensated;

    emit!(DisputeResolved {
        consignment: c.key(),
        resolution: Resolution::SlashBond,
        amount: paid,
        timestamp: now,
    });
    Ok(())
}
