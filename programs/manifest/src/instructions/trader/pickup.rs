//! top_up_freight / confirm_pickup / open_dispute: actions after approval.
//!
//! What this does:
//! 1. top_up_freight: anyone (normally the trader or ticket holder) adds the freight
//!    shortfall when the measured volume was larger than the escrowed estimate.
//! 2. confirm_pickup: the current Cargo Ticket holder, at the destination warehouse,
//!    confirms they collected the goods. Freight goes to the forwarder, any excess to the
//!    holder, the holder burns the ticket and the forwarder's track record updates.
//! 3. open_dispute: the holder disputes missing/damaged cartons after arrival (within the
//!    dispute window) or an overdue container (past ETA + overdue grace).
//!
//! Holding the ticket is proven by passing the holder's Token-2022 account for the
//! ticket mint with `amount == 1` and the signer as its owner.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::{CONFIG_SEED, DISPUTE_REASON_MAX, DISPUTE_REASON_NONE};
use crate::errors::ManifestError;
use crate::events::{DisputeOpened, FreightToppedUp, PickupConfirmed};
use crate::instructions::shared::{finish_consignment, VaultAccounts};
use crate::state::{Config, Consignment, ConsignmentStatus, Container, ContainerStatus, Forwarder};
use crate::utils::cargo_ticket::{burn_ticket, close_ticket_account};
use crate::utils::{math, token};

#[derive(Accounts)]
pub struct TopUpFreight<'info> {
    pub payer: Signer<'info>,

    #[account(
        mut,
        has_one = vault @ ManifestError::AccountMismatch,
        has_one = mint @ ManifestError::AccountMismatch
    )]
    pub consignment: Box<Account<'info, Consignment>>,

    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = payer,
        token::token_program = token_program
    )]
    pub payer_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_top_up_freight(ctx: Context<TopUpFreight>, amount: u64) -> Result<()> {
    require!(amount > 0, ManifestError::ZeroAmount);
    let c = &ctx.accounts.consignment;
    require!(
        c.status == ConsignmentStatus::Approved,
        ManifestError::InvalidConsignmentStatus
    );
    let shortfall = c.freight_due.saturating_sub(c.freight_escrowed);
    require!(amount <= shortfall, ManifestError::TopUpTooLarge);

    let a = &ctx.accounts;
    token::transfer(
        &a.token_program.to_account_info(),
        &a.payer_token_account.to_account_info(),
        &a.mint.to_account_info(),
        &a.vault.to_account_info(),
        &a.payer.to_account_info(),
        amount,
        a.mint.decimals,
        &[],
    )?;

    let c = &mut ctx.accounts.consignment;
    c.freight_escrowed = math::add(c.freight_escrowed, amount)?;
    emit!(FreightToppedUp {
        consignment: c.key(),
        payer: ctx.accounts.payer.key(),
        amount,
        freight_escrowed: c.freight_escrowed,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ConfirmPickup<'info> {
    /// The current Cargo Ticket holder.
    #[account(mut)]
    pub holder: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(mut, has_one = authority @ ManifestError::AccountMismatch)]
    pub forwarder: Box<Account<'info, Forwarder>>,

    /// CHECK: the forwarder's wallet (`has_one = authority` above); owns the freight
    /// payout account.
    pub authority: UncheckedAccount<'info>,

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

    #[account(
        init_if_needed,
        payer = holder,
        associated_token::mint = mint,
        associated_token::authority = authority,
        associated_token::token_program = token_program
    )]
    pub forwarder_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = holder,
        associated_token::mint = mint,
        associated_token::authority = holder,
        associated_token::token_program = token_program
    )]
    pub holder_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, mint::token_program = token_2022_program)]
    pub cargo_ticket_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = cargo_ticket_mint,
        token::authority = holder,
        token::token_program = token_2022_program,
        constraint = holder_ticket_account.amount == 1 @ ManifestError::NotTicketHolder
    )]
    pub holder_ticket_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub token_2022_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_confirm_pickup(ctx: Context<ConfirmPickup>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    let c = &a.consignment;
    require!(
        a.container.status == ContainerStatus::Arrived,
        ManifestError::InvalidContainerStatus
    );
    require!(
        c.status == ConsignmentStatus::Approved,
        ManifestError::InvalidConsignmentStatus
    );
    require!(
        c.freight_escrowed >= c.freight_due,
        ManifestError::FreightShort
    );

    let excess = math::sub(c.freight_escrowed, c.freight_due)?;
    let vault = VaultAccounts {
        token_program: &a.token_program.to_account_info(),
        vault: &a.vault.to_account_info(),
        mint: &a.mint.to_account_info(),
        consignment: &a.consignment.to_account_info(),
        decimals: a.mint.decimals,
    };
    vault.pay(
        c,
        &a.forwarder_token_account.to_account_info(),
        c.freight_due,
    )?;
    vault.pay(c, &a.holder_token_account.to_account_info(), excess)?;

    // The holder signs, so they burn their own ticket and reclaim the account's rent.
    let token_2022 = a.token_2022_program.to_account_info();
    burn_ticket(
        &token_2022,
        &a.cargo_ticket_mint.to_account_info(),
        &a.holder_ticket_account.to_account_info(),
        &a.holder.to_account_info(),
        &[],
    )?;
    close_ticket_account(
        &token_2022,
        &a.holder_ticket_account.to_account_info(),
        &a.holder.to_account_info(),
    )?;

    let on_time = a.container.arrived_ts
        <= a.container
            .eta_ts
            .saturating_add(a.config.on_time_grace_secs);
    let holder = a.holder.key();
    let freight_paid = c.freight_due;
    let goods = c.goods_amount;

    let a = &mut *ctx.accounts;
    let f = &mut a.forwarder;
    f.stats_consignments_delivered = f
        .stats_consignments_delivered
        .checked_add(1)
        .ok_or_else(|| error!(ManifestError::CounterOverflow))?;
    if on_time {
        f.stats_on_time = f
            .stats_on_time
            .checked_add(1)
            .ok_or_else(|| error!(ManifestError::CounterOverflow))?;
    }
    f.stats_volume = math::add(f.stats_volume, goods)?;
    finish_consignment(&mut a.container, &mut a.forwarder, &a.consignment, now)?;
    let c = &mut a.consignment;
    c.freight_escrowed = 0;
    c.settled_at = now;
    c.status = ConsignmentStatus::Delivered;

    emit!(PickupConfirmed {
        consignment: c.key(),
        holder,
        freight_paid,
        excess_refunded: excess,
        on_time,
        timestamp: now,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct OpenDispute<'info> {
    pub holder: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(mut)]
    pub forwarder: Box<Account<'info, Forwarder>>,

    #[account(has_one = forwarder @ ManifestError::AccountMismatch)]
    pub container: Box<Account<'info, Container>>,

    #[account(
        mut,
        has_one = container @ ManifestError::AccountMismatch,
        has_one = cargo_ticket_mint @ ManifestError::AccountMismatch
    )]
    pub consignment: Box<Account<'info, Consignment>>,

    #[account(mint::token_program = token_2022_program)]
    pub cargo_ticket_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        token::mint = cargo_ticket_mint,
        token::authority = holder,
        token::token_program = token_2022_program,
        constraint = holder_ticket_account.amount == 1 @ ManifestError::NotTicketHolder
    )]
    pub holder_ticket_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_2022_program: Program<'info, Token2022>,
}

pub fn handle_open_dispute(ctx: Context<OpenDispute>, reason: u8) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        reason > DISPUTE_REASON_NONE && reason <= DISPUTE_REASON_MAX,
        ManifestError::InvalidDisputeReason
    );
    let config = &ctx.accounts.config;
    let container = &ctx.accounts.container;
    require!(
        ctx.accounts.consignment.status == ConsignmentStatus::Approved,
        ManifestError::InvalidConsignmentStatus
    );

    let allowed = match container.status {
        // After arrival: within the dispute window (missing or damaged cartons).
        ContainerStatus::Arrived => {
            now <= container
                .arrived_ts
                .saturating_add(config.dispute_window_secs)
        }
        // Still at sea or never shipped: only once overdue past ETA + grace.
        ContainerStatus::Open | ContainerStatus::Closed | ContainerStatus::Loaded => {
            now > container.eta_ts.saturating_add(config.overdue_grace_secs)
        }
        ContainerStatus::Completed | ContainerStatus::Cancelled => false,
    };
    require!(allowed, ManifestError::DisputeNotAllowed);

    let c = &mut ctx.accounts.consignment;
    c.prev_status = ConsignmentStatus::Approved;
    c.status = ConsignmentStatus::Disputed;
    c.dispute_reason = reason;
    let f = &mut ctx.accounts.forwarder;
    f.stats_disputes_opened = f
        .stats_disputes_opened
        .checked_add(1)
        .ok_or_else(|| error!(ManifestError::CounterOverflow))?;

    emit!(DisputeOpened {
        consignment: c.key(),
        holder: ctx.accounts.holder.key(),
        reason,
        timestamp: now,
    });
    Ok(())
}
