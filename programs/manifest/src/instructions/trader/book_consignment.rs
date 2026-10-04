//! book_consignment: a trader books space and locks goods payment + fee + freight.
//!
//! What this does:
//! 1. Checks the container is open, before cut-off, has room for the estimated volume,
//!    and the forwarder's bond still covers `coverage_bps` of this booking's goods value.
//! 2. Computes fee (rounded down) and estimated freight + buffer (rounded up).
//! 3. Creates the Consignment PDA and its escrow vault (a token account owned by the
//!    consignment PDA) and moves `goods + fee + buffered freight` into it.
//! 4. Locks bond coverage and updates the container's counters.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::{
    ACCOUNT_VERSION, CONFIG_SEED, CONSIGNMENT_SEED, DESCRIPTION_LEN, VAULT_SEED,
};
use crate::errors::ManifestError;
use crate::events::ConsignmentBooked;
use crate::state::{Config, Consignment, ConsignmentStatus, Container, ContainerStatus, Forwarder};
use crate::utils::{math, token, validation::validate_padded_utf8};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BookConsignmentParams {
    /// Goods value in base units, paid to the payee on approval.
    pub goods_amount: u64,
    pub est_cbm_milli: u32,
    /// Supplier / agent wallet.
    pub payee: Pubkey,
    pub description: [u8; DESCRIPTION_LEN],
}

#[derive(Accounts)]
pub struct BookConsignment<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(mut)]
    pub forwarder: Box<Account<'info, Forwarder>>,

    #[account(
        mut,
        has_one = forwarder @ ManifestError::AccountMismatch,
        has_one = mint @ ManifestError::MintNotAllowed
    )]
    pub container: Box<Account<'info, Container>>,

    /// Seeds use the container's current consignment counter as the index.
    #[account(
        init,
        payer = trader,
        space = 8 + Consignment::INIT_SPACE,
        seeds = [
            CONSIGNMENT_SEED,
            container.key().as_ref(),
            container.consignment_count.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub consignment: Box<Account<'info, Consignment>>,

    /// Escrow vault owned by the consignment PDA.
    #[account(
        init,
        payer = trader,
        seeds = [VAULT_SEED, consignment.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = consignment,
        token::token_program = token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    /// Any token account of the trader's for this mint.
    #[account(
        mut,
        token::mint = mint,
        token::authority = trader,
        token::token_program = token_program
    )]
    pub trader_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_book_consignment(
    ctx: Context<BookConsignment>,
    params: BookConsignmentParams,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let container = &ctx.accounts.container;
    let forwarder = &ctx.accounts.forwarder;
    let now = Clock::get()?.unix_timestamp;

    require!(!config.paused, ManifestError::Paused);
    require!(
        config.is_payment_mint(&container.mint),
        ManifestError::MintNotAllowed
    );
    require!(
        container.status == ContainerStatus::Open,
        ManifestError::InvalidContainerStatus
    );
    require!(now < container.cutoff_ts, ManifestError::BookingClosed);
    require!(params.goods_amount > 0, ManifestError::ZeroAmount);
    require!(params.est_cbm_milli > 0, ManifestError::ZeroAmount);
    validate_padded_utf8(&params.description)?;

    // The payee must be a real, distinct wallet. Distinct from the trader and the
    // treasury so the payout, refund and fee token accounts never alias at approval.
    let trader = ctx.accounts.trader.key();
    for forbidden in [
        Pubkey::default(),
        ctx.accounts.vault.key(),
        ctx.accounts.consignment.key(),
        trader,
        config.treasury_owner,
    ] {
        require_keys_neq!(params.payee, forbidden, ManifestError::InvalidPayee);
    }
    require_keys_neq!(trader, config.treasury_owner, ManifestError::InvalidPayee);

    let booked = container
        .booked_cbm_milli
        .checked_add(params.est_cbm_milli)
        .ok_or_else(|| error!(ManifestError::CapacityExceeded))?;
    require!(
        booked <= container.capacity_cbm_milli,
        ManifestError::CapacityExceeded
    );

    let coverage = math::bps_ceil(params.goods_amount, config.coverage_bps)?;
    let locked = math::add(forwarder.locked_coverage, coverage)?;
    require!(
        locked <= forwarder.bond_balance,
        ManifestError::CoverageExceeded
    );

    let fee = math::bps_floor(params.goods_amount, config.fee_bps)?;
    let est_freight = math::freight_for(params.est_cbm_milli, container.rate_per_cbm)?;
    let freight = math::buffered_freight(est_freight, config.freight_buffer_bps)?;
    let total = math::add(math::add(params.goods_amount, fee)?, freight)?;

    let a = &ctx.accounts;
    token::transfer(
        &a.token_program.to_account_info(),
        &a.trader_token_account.to_account_info(),
        &a.mint.to_account_info(),
        &a.vault.to_account_info(),
        &a.trader.to_account_info(),
        total,
        a.mint.decimals,
        &[],
    )?;

    let container = &mut ctx.accounts.container;
    let index = container.consignment_count;
    container.consignment_count = index
        .checked_add(1)
        .ok_or_else(|| error!(ManifestError::CounterOverflow))?;
    container.active_count = container
        .active_count
        .checked_add(1)
        .ok_or_else(|| error!(ManifestError::CounterOverflow))?;
    container.booked_cbm_milli = booked;
    ctx.accounts.forwarder.locked_coverage = locked;

    let c = &mut ctx.accounts.consignment;
    c.version = ACCOUNT_VERSION;
    c.bump = ctx.bumps.consignment;
    c.vault_bump = ctx.bumps.vault;
    c.container = container.key();
    c.index = index;
    c.trader = trader;
    c.payee = params.payee;
    c.mint = container.mint;
    c.vault = ctx.accounts.vault.key();
    c.goods_amount = params.goods_amount;
    c.fee_amount = fee;
    c.freight_escrowed = freight;
    c.est_cbm_milli = params.est_cbm_milli;
    c.description = params.description;
    c.coverage_locked = coverage;
    c.status = ConsignmentStatus::Booked;
    c.prev_status = ConsignmentStatus::Booked;
    c.booked_at = now;

    emit!(ConsignmentBooked {
        consignment: c.key(),
        container: c.container,
        trader,
        payee: c.payee,
        goods_amount: c.goods_amount,
        fee_amount: fee,
        freight_escrowed: freight,
        est_cbm_milli: c.est_cbm_milli,
        coverage_locked: coverage,
        timestamp: now,
    });
    Ok(())
}
