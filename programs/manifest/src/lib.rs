//! Manifest: a programmable letter of credit for shared-container importers.
//!
//! Funds sit in per-consignment escrow vaults and move only when the milestone
//! they pay for is proven. Forwarders post a slashable bond before they can
//! take bookings, and every approved consignment mints a transferable Cargo
//! Ticket (a Token-2022 NFT) that carries pickup and dispute rights.
//!
//! The full specification lives in `MANIFEST_BUILD_PROMPT.md` section 5.
//! Instructions are added phase by phase; see `PROGRESS.md`.

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;
use state::ConfigParams;

declare_id!("HQHe42ZUBWmrSbjW4zr9Qt2wdGDYyH1QpiYLJe3z7Jci");

#[program]
pub mod manifest {
    use super::*;

    // ---- Admin ----

    pub fn initialize_config<'info>(
        ctx: Context<'info, InitializeConfig<'info>>,
        params: ConfigParams,
    ) -> Result<()> {
        handle_initialize_config(ctx, params)
    }

    pub fn update_config<'info>(
        ctx: Context<'info, UpdateConfig<'info>>,
        params: ConfigParams,
    ) -> Result<()> {
        handle_update_config(ctx, params)
    }

    pub fn transfer_admin(ctx: Context<TransferAdmin>, new_admin: Pubkey) -> Result<()> {
        handle_transfer_admin(ctx, new_admin)
    }

    // ---- Forwarder ----

    pub fn register_forwarder(
        ctx: Context<RegisterForwarder>,
        name: [u8; constants::NAME_LEN],
    ) -> Result<()> {
        handle_register_forwarder(ctx, name)
    }

    pub fn deposit_bond(ctx: Context<MoveBond>, amount: u64) -> Result<()> {
        handle_deposit_bond(ctx, amount)
    }

    pub fn withdraw_bond(ctx: Context<MoveBond>, amount: u64) -> Result<()> {
        handle_withdraw_bond(ctx, amount)
    }

    pub fn open_container(ctx: Context<OpenContainer>, params: OpenContainerParams) -> Result<()> {
        handle_open_container(ctx, params)
    }

    pub fn close_booking(ctx: Context<CloseBooking>) -> Result<()> {
        handle_close_booking(ctx)
    }

    pub fn cancel_container(ctx: Context<CancelContainer>) -> Result<()> {
        handle_cancel_container(ctx)
    }
}
