//! Token helpers: `transfer_checked` CPIs (with optional PDA signer) and mint validation.
//!
//! A CPI (cross-program invocation) is our program calling the token program. When the
//! source account is owned by one of our PDAs, we pass that PDA's seeds as
//! `signer_seeds`, and the runtime treats the PDA as having signed.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TransferChecked};

use crate::constants::REQUIRED_MINT_DECIMALS;
use crate::errors::ManifestError;

/// Move `amount` tokens with `transfer_checked`, which also verifies the mint and decimals.
/// A zero amount is a no-op so callers don't need to special-case it.
#[allow(clippy::too_many_arguments)]
pub fn transfer<'info>(
    token_program: &AccountInfo<'info>,
    from: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    amount: u64,
    decimals: u8,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let accounts = TransferChecked {
        from: from.clone(),
        mint: mint.clone(),
        to: to.clone(),
        authority: authority.clone(),
    };
    let ctx = CpiContext::new_with_signer(token_program.key(), accounts, signer_seeds);
    token_interface::transfer_checked(ctx, amount, decimals)
}

/// Check that every non-empty mint slot has a matching account in `mint_accounts`
/// that is owned by SPL Token or Token-2022 and has 6 decimals.
pub fn validate_mints<'info>(
    mints: &[Pubkey],
    mint_accounts: &'info [AccountInfo<'info>],
) -> Result<()> {
    for mint in mints.iter().filter(|m| **m != Pubkey::default()) {
        let info = mint_accounts
            .iter()
            .find(|a| a.key == mint)
            .ok_or_else(|| error!(ManifestError::InvalidMintAccount))?;
        // InterfaceAccount checks the owner is a token program and deserializes the mint.
        let parsed = InterfaceAccount::<Mint>::try_from(info)
            .map_err(|_| error!(ManifestError::InvalidMintAccount))?;
        require!(
            parsed.decimals == REQUIRED_MINT_DECIMALS,
            ManifestError::InvalidMintDecimals
        );
    }
    Ok(())
}
