//! transfer_admin: hand the admin role to a new wallet (e.g. a Squads vault).
//!
//! What this does:
//! 1. Requires the current admin's signature.
//! 2. Rejects the default (all-zero) pubkey so the role can't be burned by mistake.
//! 3. Sets `config.admin = new_admin`.

use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::errors::ManifestError;
use crate::events::AdminTransferred;
use crate::state::Config;

#[derive(Accounts)]
pub struct TransferAdmin<'info> {
    pub admin: Signer<'info>,

    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin)]
    pub config: Box<Account<'info, Config>>,
}

pub fn handle_transfer_admin(ctx: Context<TransferAdmin>, new_admin: Pubkey) -> Result<()> {
    require_keys_neq!(new_admin, Pubkey::default(), ManifestError::AccountMismatch);
    let config = &mut ctx.accounts.config;
    let old_admin = config.admin;
    config.admin = new_admin;

    emit!(AdminTransferred {
        old_admin,
        new_admin,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
