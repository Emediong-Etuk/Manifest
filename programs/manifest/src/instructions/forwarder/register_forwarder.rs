//! register_forwarder: create a forwarder profile and its bond vault.
//!
//! What this does:
//! 1. Creates the `Forwarder` PDA `["forwarder", authority]` (one per wallet).
//! 2. Checks the chosen bond mint is allowed by config.
//! 3. Creates the bond vault, a token account PDA `["bond_vault", forwarder]` whose
//!    owner (authority) is the forwarder PDA, so only this program can move the bond.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::{ACCOUNT_VERSION, BOND_VAULT_SEED, CONFIG_SEED, FORWARDER_SEED, NAME_LEN};
use crate::errors::ManifestError;
use crate::events::ForwarderRegistered;
use crate::state::{Config, Forwarder};
use crate::utils::validation::validate_padded_utf8;

#[derive(Accounts)]
pub struct RegisterForwarder<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        init,
        payer = authority,
        space = 8 + Forwarder::INIT_SPACE,
        seeds = [FORWARDER_SEED, authority.key().as_ref()],
        bump
    )]
    pub forwarder: Box<Account<'info, Forwarder>>,

    #[account(
        mint::token_program = token_program,
        constraint = config.is_bond_mint(&bond_mint.key()) @ ManifestError::MintNotAllowed
    )]
    pub bond_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = authority,
        seeds = [BOND_VAULT_SEED, forwarder.key().as_ref()],
        bump,
        token::mint = bond_mint,
        token::authority = forwarder,
        token::token_program = token_program
    )]
    pub bond_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_register_forwarder(
    ctx: Context<RegisterForwarder>,
    name: [u8; NAME_LEN],
) -> Result<()> {
    validate_padded_utf8(&name)?;
    let now = Clock::get()?.unix_timestamp;

    let forwarder = &mut ctx.accounts.forwarder;
    forwarder.version = ACCOUNT_VERSION;
    forwarder.bump = ctx.bumps.forwarder;
    forwarder.bond_vault_bump = ctx.bumps.bond_vault;
    forwarder.authority = ctx.accounts.authority.key();
    forwarder.name = name;
    forwarder.bond_mint = ctx.accounts.bond_mint.key();
    forwarder.bond_vault = ctx.accounts.bond_vault.key();
    forwarder.created_at = now;
    // Counters and stats start at zero (Anchor zero-initializes new accounts).

    emit!(ForwarderRegistered {
        forwarder: forwarder.key(),
        authority: forwarder.authority,
        bond_mint: forwarder.bond_mint,
        timestamp: now,
    });
    Ok(())
}
