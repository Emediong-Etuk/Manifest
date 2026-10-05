//! update_config: the admin replaces every settable config field (not the admin itself).
//!
//! What this does:
//! 1. Requires the current admin's signature (`has_one = admin`).
//! 2. Re-validates the full parameter set exactly like `initialize_config`.
//! 3. Can pause or unpause; pausing only blocks new containers and bookings.

use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::events::ConfigUpdated;
use crate::state::{Config, ConfigParams};

use super::apply_params;

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,

    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin)]
    pub config: Box<Account<'info, Config>>,
}

pub fn handle_update_config<'info>(
    ctx: Context<'info, UpdateConfig<'info>>,
    params: ConfigParams,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    apply_params(config, &params, ctx.remaining_accounts)?;

    emit!(ConfigUpdated {
        admin: config.admin,
        paused: config.paused,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
