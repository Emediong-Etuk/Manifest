//! Approval settlement, shared by `approve_goods` (trader, within the review window)
//! and `auto_approve` (anyone, after the review window).
//!
//! What this does, in one transaction:
//! 1. Pays `goods_amount` from the vault to the payee's token account.
//! 2. Pays the protocol fee to the treasury's token account.
//! 3. Re-prices freight from the measured volume; any excess escrow goes back to the
//!    trader now (a shortfall must be topped up before pickup, Phase 2).
//! 4. Mints the Cargo Ticket (Token-2022 NFT) to the trader and locks its supply at 1.
//! 5. Marks the consignment `Approved` and bumps the container's approved counter.
//!
//! The payer signs and pays rent for any token accounts that don't exist yet and for the
//! ticket mint. In `approve_goods` the payer must be the trader.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::{CARGO_TICKET_SEED, CONFIG_SEED, TICKET_AUTHORITY_SEED};
use crate::errors::ManifestError;
use crate::events::{CargoTicketMinted, GoodsApproved};
use crate::instructions::shared::VaultAccounts;
use crate::state::{Config, Consignment, ConsignmentStatus, Container};
use crate::utils::cargo_ticket::{finish_cargo_ticket, ticket_name, CargoTicketAccounts};
use crate::utils::math;
use crate::utils::validation::padded_str;

#[derive(Accounts)]
pub struct SettleApproval<'info> {
    /// Trader (approve_goods) or any cranker (auto_approve). Pays rent.
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(mut)]
    pub container: Box<Account<'info, Container>>,

    #[account(
        mut,
        has_one = container @ ManifestError::AccountMismatch,
        has_one = vault @ ManifestError::AccountMismatch,
        has_one = mint @ ManifestError::AccountMismatch,
        has_one = trader @ ManifestError::AccountMismatch,
        has_one = payee @ ManifestError::AccountMismatch
    )]
    pub consignment: Box<Account<'info, Consignment>>,

    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: equals `consignment.trader` (has_one); receives the freight refund and ticket.
    pub trader: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = trader,
        associated_token::token_program = token_program
    )]
    pub trader_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: equals `consignment.payee` (has_one); receives the goods payment.
    pub payee: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = payee,
        associated_token::token_program = token_program
    )]
    pub payee_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: must equal `config.treasury_owner`; owns the fee token account.
    #[account(address = config.treasury_owner @ ManifestError::AccountMismatch)]
    pub treasury_owner: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = treasury_owner,
        associated_token::token_program = token_program
    )]
    pub treasury_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: PDA `["ticket_authority"]`; holds no data. Mint authority, metadata
    /// authority and permanent delegate of every Cargo Ticket.
    #[account(seeds = [TICKET_AUTHORITY_SEED], bump = config.ticket_authority_bump)]
    pub ticket_authority: UncheckedAccount<'info>,

    /// The Cargo Ticket: Token-2022 mint PDA `["cargo_ticket", consignment]`, 0 decimals,
    /// metadata stored in the mint itself, ticket_authority as permanent delegate.
    #[account(
        init,
        payer = payer,
        seeds = [CARGO_TICKET_SEED, consignment.key().as_ref()],
        bump,
        mint::decimals = 0,
        mint::authority = ticket_authority,
        mint::token_program = token_2022_program,
        extensions::metadata_pointer::authority = ticket_authority,
        extensions::metadata_pointer::metadata_address = cargo_ticket_mint,
        extensions::permanent_delegate::delegate = ticket_authority
    )]
    pub cargo_ticket_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = cargo_ticket_mint,
        associated_token::authority = trader,
        associated_token::token_program = token_2022_program
    )]
    pub trader_ticket_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Token program of the payment mint (SPL Token or Token-2022).
    pub token_program: Interface<'info, TokenInterface>,
    pub token_2022_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// approve_goods: the trader approves the warehouse evidence within the review window.
pub fn handle_approve_goods(ctx: Context<SettleApproval>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let c = &ctx.accounts.consignment;
    require_keys_eq!(ctx.accounts.payer.key(), c.trader, ManifestError::NotTrader);
    require!(
        c.status == ConsignmentStatus::Received,
        ManifestError::InvalidConsignmentStatus
    );
    require!(now <= c.review_deadline, ManifestError::ReviewWindowClosed);
    settle_approval(ctx, now, false)
}

/// The settlement itself. Callers check status, signer and timing first.
pub fn settle_approval(ctx: Context<SettleApproval>, now: i64, auto: bool) -> Result<()> {
    let a = &ctx.accounts;
    let c = &a.consignment;

    let vault = VaultAccounts {
        token_program: &a.token_program.to_account_info(),
        vault: &a.vault.to_account_info(),
        mint: &a.mint.to_account_info(),
        consignment: &a.consignment.to_account_info(),
        decimals: a.mint.decimals,
    };

    // 1-2. Goods to the payee, fee to the treasury.
    vault.pay(c, &a.payee_token_account.to_account_info(), c.goods_amount)?;
    vault.pay(c, &a.treasury_token_account.to_account_info(), c.fee_amount)?;

    // 3. Re-price freight on the measured volume and refund any excess now.
    let freight_due = math::freight_for(c.measured_cbm_milli, a.container.rate_per_cbm)?;
    let refund = c.freight_escrowed.saturating_sub(freight_due);
    vault.pay(c, &a.trader_token_account.to_account_info(), refund)?;

    // 4. Cargo Ticket: metadata, mint 1 to the trader, revoke mint authority.
    let name = ticket_name(padded_str(&a.container.code), c.index);
    let uri = format!(
        "{}{}",
        padded_str(&a.config.metadata_base_uri),
        a.consignment.key()
    );
    let ticket_bump = [a.config.ticket_authority_bump];
    let ticket_seeds: &[&[u8]] = &[TICKET_AUTHORITY_SEED, &ticket_bump];
    finish_cargo_ticket(
        CargoTicketAccounts {
            payer: &a.payer.to_account_info(),
            mint: &a.cargo_ticket_mint.to_account_info(),
            holder_token_account: &a.trader_ticket_account.to_account_info(),
            ticket_authority: &a.ticket_authority.to_account_info(),
            token_2022_program: &a.token_2022_program.to_account_info(),
            system_program: &a.system_program.to_account_info(),
        },
        name,
        uri,
        &[ticket_seeds],
    )?;

    // 5. State.
    let ticket_mint = a.cargo_ticket_mint.key();
    let a = &mut *ctx.accounts;
    a.container.approved_count = a
        .container
        .approved_count
        .checked_add(1)
        .ok_or_else(|| error!(ManifestError::CounterOverflow))?;
    let c = &mut a.consignment;
    c.freight_escrowed = math::sub(c.freight_escrowed, refund)?;
    c.freight_due = freight_due;
    c.cargo_ticket_mint = ticket_mint;
    c.approved_at = now;
    c.status = ConsignmentStatus::Approved;

    emit!(GoodsApproved {
        consignment: c.key(),
        container: c.container,
        payee: c.payee,
        goods_paid: c.goods_amount,
        fee_paid: c.fee_amount,
        freight_due,
        freight_refunded: refund,
        auto,
        timestamp: now,
    });
    emit!(CargoTicketMinted {
        consignment: c.key(),
        mint: ticket_mint,
        owner: c.trader,
        timestamp: now,
    });
    Ok(())
}
