//! Logic shared by several instructions: escrow refunds and releasing a booking's
//! capacity and bond coverage.

use anchor_lang::prelude::*;

use crate::constants::CONSIGNMENT_SEED;
use crate::errors::ManifestError;
use crate::events::ContainerCompleted;
use crate::state::{Consignment, Container, ContainerStatus, Forwarder};
use crate::utils::{math, token};

/// Undo a booking's footprint: free its estimated volume in the container, decrement the
/// active count, and unlock its share of the forwarder's bond coverage.
pub fn release_booking(
    container: &mut Container,
    forwarder: &mut Forwarder,
    consignment: &Consignment,
) -> Result<()> {
    container.active_count = container
        .active_count
        .checked_sub(1)
        .ok_or_else(|| error!(ManifestError::CounterOverflow))?;
    container.booked_cbm_milli = container
        .booked_cbm_milli
        .checked_sub(consignment.est_cbm_milli)
        .ok_or_else(|| error!(ManifestError::CounterOverflow))?;
    forwarder.locked_coverage = math::sub(forwarder.locked_coverage, consignment.coverage_locked)?;
    Ok(())
}

/// Final bookkeeping for a consignment that leaves `Approved` for good (delivered,
/// settled or compensated): unlock its bond coverage, count it as settled and, once every
/// active consignment of an arrived container is settled, mark the container `Completed`.
pub fn finish_consignment(
    container: &mut Account<'_, Container>,
    forwarder: &mut Forwarder,
    consignment: &Consignment,
    now: i64,
) -> Result<()> {
    forwarder.locked_coverage = math::sub(forwarder.locked_coverage, consignment.coverage_locked)?;
    container.settled_count = container
        .settled_count
        .checked_add(1)
        .ok_or_else(|| error!(ManifestError::CounterOverflow))?;
    if container.status == ContainerStatus::Arrived
        && container.settled_count == container.active_count
    {
        container.status = ContainerStatus::Completed;
        emit!(ContainerCompleted {
            container: container.key(),
            timestamp: now,
        });
    }
    Ok(())
}

/// Token accounts and programs needed to move tokens out of a consignment vault.
pub struct VaultAccounts<'a, 'info> {
    pub token_program: &'a AccountInfo<'info>,
    pub vault: &'a AccountInfo<'info>,
    pub mint: &'a AccountInfo<'info>,
    pub consignment: &'a AccountInfo<'info>,
    pub decimals: u8,
}

impl<'info> VaultAccounts<'_, 'info> {
    /// Transfer from the vault, signed by the consignment PDA (the vault's owner).
    /// The PDA "signs" because we pass the seeds it was derived from plus its bump.
    pub fn pay(
        &self,
        consignment: &Consignment,
        to: &AccountInfo<'info>,
        amount: u64,
    ) -> Result<()> {
        let index = consignment.index.to_le_bytes();
        let seeds: &[&[u8]] = &[
            CONSIGNMENT_SEED,
            consignment.container.as_ref(),
            &index,
            &[consignment.bump],
        ];
        token::transfer(
            self.token_program,
            self.vault,
            self.mint,
            to,
            self.consignment,
            amount,
            self.decimals,
            &[seeds],
        )
    }
}
