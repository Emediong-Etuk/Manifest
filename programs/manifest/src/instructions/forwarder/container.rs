//! open_container / close_booking / cancel_container.
//!
//! What this does:
//! 1. open_container: the forwarder opens a shared container (route, mode, payment mint,
//!    capacity, rate, cut-off, ETA). Its PDA index is the forwarder's `container_count`.
//! 2. close_booking: stops new bookings. The forwarder can close any time; after the
//!    cut-off anyone (the crank) can, so containers never stay open by accident.
//! 3. cancel_container: the forwarder cancels a container that has no active bookings.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::constants::{
    ACCOUNT_VERSION, CODE_LEN, CONFIG_SEED, CONTAINER_SEED, FORWARDER_SEED, LOCODE_LEN,
};
use crate::errors::ManifestError;
use crate::events::{BookingClosed, ContainerCancelled, ContainerOpened};
use crate::state::{Config, Container, ContainerMode, ContainerStatus, Forwarder};
use crate::utils::validation::{validate_locode, validate_padded_utf8};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OpenContainerParams {
    pub code: [u8; CODE_LEN],
    pub origin: [u8; LOCODE_LEN],
    pub destination: [u8; LOCODE_LEN],
    pub mode: ContainerMode,
    pub capacity_cbm_milli: u32,
    pub rate_per_cbm: u64,
    pub cutoff_ts: i64,
    pub eta_ts: i64,
}

#[derive(Accounts)]
pub struct OpenContainer<'info> {
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

    /// Seeds use the forwarder's current container counter as the index.
    #[account(
        init,
        payer = authority,
        space = 8 + Container::INIT_SPACE,
        seeds = [
            CONTAINER_SEED,
            forwarder.key().as_ref(),
            forwarder.container_count.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub container: Box<Account<'info, Container>>,

    #[account(constraint = config.is_payment_mint(&mint.key()) @ ManifestError::MintNotAllowed)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    pub system_program: Program<'info, System>,
}

pub fn handle_open_container(
    ctx: Context<OpenContainer>,
    params: OpenContainerParams,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, ManifestError::Paused);
    validate_padded_utf8(&params.code)?;
    validate_locode(&params.origin)?;
    validate_locode(&params.destination)?;
    require!(
        params.origin != params.destination,
        ManifestError::SamePorts
    );
    require!(params.capacity_cbm_milli > 0, ManifestError::ZeroCapacity);
    require!(params.rate_per_cbm > 0, ManifestError::ZeroRate);
    let now = Clock::get()?.unix_timestamp;
    require!(
        now < params.cutoff_ts && params.cutoff_ts < params.eta_ts,
        ManifestError::InvalidSchedule
    );

    let forwarder = &mut ctx.accounts.forwarder;
    let index = forwarder.container_count;
    forwarder.container_count = index
        .checked_add(1)
        .ok_or_else(|| error!(ManifestError::CounterOverflow))?;

    let container = &mut ctx.accounts.container;
    container.version = ACCOUNT_VERSION;
    container.bump = ctx.bumps.container;
    container.forwarder = forwarder.key();
    container.index = index;
    container.code = params.code;
    container.origin = params.origin;
    container.destination = params.destination;
    container.mode = params.mode;
    container.mint = ctx.accounts.mint.key();
    container.capacity_cbm_milli = params.capacity_cbm_milli;
    container.rate_per_cbm = params.rate_per_cbm;
    container.cutoff_ts = params.cutoff_ts;
    container.eta_ts = params.eta_ts;
    container.status = ContainerStatus::Open;

    emit!(ContainerOpened {
        container: container.key(),
        forwarder: container.forwarder,
        index,
        mint: container.mint,
        capacity_cbm_milli: container.capacity_cbm_milli,
        rate_per_cbm: container.rate_per_cbm,
        cutoff_ts: container.cutoff_ts,
        eta_ts: container.eta_ts,
        timestamp: now,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct CloseBooking<'info> {
    /// The forwarder's wallet, or anyone once the cut-off has passed.
    pub caller: Signer<'info>,

    pub forwarder: Box<Account<'info, Forwarder>>,

    #[account(mut, has_one = forwarder @ ManifestError::AccountMismatch)]
    pub container: Box<Account<'info, Container>>,
}

pub fn handle_close_booking(ctx: Context<CloseBooking>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let container = &mut ctx.accounts.container;
    require!(
        container.status == ContainerStatus::Open,
        ManifestError::InvalidContainerStatus
    );
    let is_forwarder = ctx.accounts.caller.key() == ctx.accounts.forwarder.authority;
    require!(
        is_forwarder || now >= container.cutoff_ts,
        ManifestError::CutoffNotReached
    );
    container.status = ContainerStatus::Closed;

    emit!(BookingClosed {
        container: container.key(),
        closed_by: ctx.accounts.caller.key(),
        timestamp: now,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct CancelContainer<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [FORWARDER_SEED, authority.key().as_ref()],
        bump = forwarder.bump,
        has_one = authority @ ManifestError::NotForwarder
    )]
    pub forwarder: Box<Account<'info, Forwarder>>,

    #[account(mut, has_one = forwarder @ ManifestError::AccountMismatch)]
    pub container: Box<Account<'info, Container>>,
}

pub fn handle_cancel_container(ctx: Context<CancelContainer>) -> Result<()> {
    let container = &mut ctx.accounts.container;
    require!(
        matches!(
            container.status,
            ContainerStatus::Open | ContainerStatus::Closed
        ),
        ManifestError::InvalidContainerStatus
    );
    require!(
        container.active_count == 0,
        ManifestError::ContainerHasActiveConsignments
    );
    container.status = ContainerStatus::Cancelled;

    emit!(ContainerCancelled {
        container: container.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
