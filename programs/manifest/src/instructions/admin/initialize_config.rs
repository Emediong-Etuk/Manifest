//! initialize_config: create the singleton `Config` account.
//!
//! What this does:
//! 1. Only the program's upgrade authority (the deployer) may call it, so nobody can
//!    front-run the real configuration right after deployment.
//! 2. Validates the params (bps <= 10_000, windows > 0, at least one payment and one
//!    bond mint, every listed mint has 6 decimals; mints are passed as remaining accounts).
//! 3. Stores the params, the admin and the cached PDA bumps.

use anchor_lang::prelude::*;

use crate::constants::{ACCOUNT_VERSION, CONFIG_SEED, TICKET_AUTHORITY_SEED};
use crate::events::ConfigUpdated;
use crate::program::Manifest;
use crate::state::{Config, ConfigParams};

use super::apply_params;

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Box<Account<'info, Config>>,

    /// The program's ProgramData account must name `admin` as upgrade authority.
    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program: Program<'info, Manifest>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()))]
    pub program_data: Account<'info, ProgramData>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_config<'info>(
    ctx: Context<'info, InitializeConfig<'info>>,
    params: ConfigParams,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.version = ACCOUNT_VERSION;
    config.bump = ctx.bumps.config;
    config.ticket_authority_bump =
        Pubkey::find_program_address(&[TICKET_AUTHORITY_SEED], ctx.program_id).1;
    config.admin = ctx.accounts.admin.key();
    apply_params(config, &params, ctx.remaining_accounts)?;

    emit!(ConfigUpdated {
        admin: config.admin,
        paused: config.paused,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
