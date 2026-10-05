//! Admin instructions: initialize_config, update_config, transfer_admin.

pub mod initialize_config;
pub mod transfer_admin;
pub mod update_config;

pub use initialize_config::*;
pub use transfer_admin::*;
pub use update_config::*;

use anchor_lang::prelude::*;

use crate::constants::BPS_DENOMINATOR;
use crate::errors::ManifestError;
use crate::state::{Config, ConfigParams};
use crate::utils::{token::validate_mints, validation::validate_padded_utf8};

/// Validate `params` and copy them into `config`. Shared by initialize and update.
pub(crate) fn apply_params<'info>(
    config: &mut Config,
    params: &ConfigParams,
    mint_accounts: &'info [AccountInfo<'info>],
) -> Result<()> {
    for bps in [
        params.fee_bps,
        params.coverage_bps,
        params.freight_buffer_bps,
    ] {
        require!(u64::from(bps) <= BPS_DENOMINATOR, ManifestError::InvalidBps);
    }
    for window in [
        params.review_window_secs,
        params.pickup_grace_secs,
        params.dispute_window_secs,
        params.overdue_grace_secs,
        params.on_time_grace_secs,
    ] {
        require!(window > 0, ManifestError::InvalidWindow);
    }
    let has_mint = |mints: &[Pubkey]| mints.iter().any(|m| *m != Pubkey::default());
    require!(
        has_mint(&params.payment_mints) && has_mint(&params.bond_mints),
        ManifestError::NoMintsConfigured
    );
    validate_mints(&params.payment_mints, mint_accounts)?;
    validate_mints(&params.bond_mints, mint_accounts)?;
    validate_padded_utf8(&params.metadata_base_uri)?;
    require_keys_neq!(
        params.arbitrator,
        Pubkey::default(),
        ManifestError::AccountMismatch
    );
    require_keys_neq!(
        params.treasury_owner,
        Pubkey::default(),
        ManifestError::AccountMismatch
    );

    config.arbitrator = params.arbitrator;
    config.treasury_owner = params.treasury_owner;
    config.payment_mints = params.payment_mints;
    config.bond_mints = params.bond_mints;
    config.fee_bps = params.fee_bps;
    config.coverage_bps = params.coverage_bps;
    config.freight_buffer_bps = params.freight_buffer_bps;
    config.review_window_secs = params.review_window_secs;
    config.pickup_grace_secs = params.pickup_grace_secs;
    config.dispute_window_secs = params.dispute_window_secs;
    config.overdue_grace_secs = params.overdue_grace_secs;
    config.on_time_grace_secs = params.on_time_grace_secs;
    config.metadata_base_uri = params.metadata_base_uri;
    config.paused = params.paused;
    Ok(())
}
