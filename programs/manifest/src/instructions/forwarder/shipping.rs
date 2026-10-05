//! mark_loaded / mark_arrived / claim_freight_after_grace: the voyage and the
//! forwarder's fallback payout.
//!
//! What this does:
//! 1. mark_loaded: once bookings are closed and every active consignment is approved,
//!    the forwarder records the ISO 6346 container number and the bill-of-lading hash.
//! 2. mark_arrived: the container reached the destination port; pickups can start.
//! 3. claim_freight_after_grace: if the ticket holder never confirms pickup, the forwarder
//!    collects the freight after the pickup grace period (no dispute open). The program
//!    burns the ticket itself using its permanent-delegate authority.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::{CONFIG_SEED, CONTAINER_NUMBER_LEN, FORWARDER_SEED, TICKET_AUTHORITY_SEED};
use crate::errors::ManifestError;
use crate::events::{ContainerArrived, ContainerLoaded, FreightClaimed};
use crate::instructions::shared::{finish_consignment, VaultAccounts};
use crate::state::{Config, Consignment, ConsignmentStatus, Container, ContainerStatus, Forwarder};
use crate::utils::cargo_ticket::burn_ticket;
use crate::utils::{math, validation::validate_iso6346};

#[derive(Accounts)]
pub struct ShipContainer<'info> {
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
}

pub fn handle_mark_loaded(
    ctx: Context<ShipContainer>,
    container_number: [u8; CONTAINER_NUMBER_LEN],
    bl_hash: [u8; 32],
) -> Result<()> {
    let container = &mut ctx.accounts.container;
    require!(
        container.status == ContainerStatus::Closed,
        ManifestError::InvalidContainerStatus
    );
    require!(
        container.active_count > 0 && container.approved_count == container.active_count,
        ManifestError::ConsignmentsNotApproved
    );
    validate_iso6346(&container_number)?;
    require!(bl_hash != [0u8; 32], ManifestError::MissingBillOfLading);

    let now = Clock::get()?.unix_timestamp;
    container.container_number = container_number;
    container.bl_hash = bl_hash;
    container.loaded_ts = now;
    container.status = ContainerStatus::Loaded;

    emit!(ContainerLoaded {
        container: container.key(),
        container_number,
        bl_hash,
        timestamp: now,
    });
    Ok(())
}

pub fn handle_mark_arrived(ctx: Context<ShipContainer>) -> Result<()> {
    let on_time_grace = ctx.accounts.config.on_time_grace_secs;
    let container = &mut ctx.accounts.container;
    require!(
        container.status == ContainerStatus::Loaded,
        ManifestError::InvalidContainerStatus
    );
    let now = Clock::get()?.unix_timestamp;
    container.arrived_ts = now;
    container.status = ContainerStatus::Arrived;
    // Consignments compensated while the container was overdue are already settled.
    if container.settled_count == container.active_count {
        container.status = ContainerStatus::Completed;
    }

    emit!(ContainerArrived {
        container: container.key(),
        on_time: now <= container.eta_ts.saturating_add(on_time_grace),
        timestamp: now,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ClaimFreightAfterGrace<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

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
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = authority,
        associated_token::token_program = token_program
    )]
    pub forwarder_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: the current ticket holder, read from `holder_ticket_account`.
    #[account(address = holder_ticket_account.owner @ ManifestError::NotTicketHolder)]
    pub holder: UncheckedAccount<'info>,

    /// Receives any freight paid beyond what was due (from top-ups).
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = holder,
        associated_token::token_program = token_program
    )]
    pub holder_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, mint::token_program = token_2022_program)]
    pub cargo_ticket_mint: Box<InterfaceAccount<'info, Mint>>,

    /// The account holding the ticket. Supply is 1, so `amount == 1` identifies the holder.
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
    pub token_2022_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_claim_freight_after_grace(ctx: Context<ClaimFreightAfterGrace>) -> Result<()> {
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
    let grace_end = a
        .container
        .arrived_ts
        .checked_add(a.config.pickup_grace_secs)
        .ok_or_else(|| error!(ManifestError::MathOverflow))?;
    require!(now > grace_end, ManifestError::PickupGraceNotOver);
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

    // Burn the ticket with the program's permanent-delegate authority (no holder
    // signature needed). This is one of the two documented uses of that authority.
    let ticket_bump = [a.config.ticket_authority_bump];
    let ticket_seeds: &[&[u8]] = &[TICKET_AUTHORITY_SEED, &ticket_bump];
    burn_ticket(
        &a.token_2022_program.to_account_info(),
        &a.cargo_ticket_mint.to_account_info(),
        &a.holder_ticket_account.to_account_info(),
        &a.ticket_authority.to_account_info(),
        &[ticket_seeds],
    )?;

    let holder = a.holder.key();
    let freight_paid = c.freight_due;
    let a = &mut *ctx.accounts;
    finish_consignment(&mut a.container, &mut a.forwarder, &a.consignment, now)?;
    let c = &mut a.consignment;
    c.freight_escrowed = 0;
    c.settled_at = now;
    c.status = ConsignmentStatus::Settled;

    emit!(FreightClaimed {
        consignment: c.key(),
        holder,
        freight_paid,
        excess_refunded: excess,
        timestamp: now,
    });
    Ok(())
}
