//! deposit_bond / withdraw_bond: move tokens into or out of the forwarder's bond vault.
//!
//! What this does:
//! 1. Both require the forwarder's own wallet (`has_one = authority`).
//! 2. Deposit: wallet token account -> bond vault; `bond_balance += amount`.
//! 3. Withdraw: bond vault -> wallet token account, signed by the forwarder PDA, and only
//!    while the remaining bond still covers `locked_coverage` (open consignments).

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::FORWARDER_SEED;
use crate::errors::ManifestError;
use crate::events::{BondDeposited, BondWithdrawn};
use crate::state::Forwarder;
use crate::utils::{math, token};

#[derive(Accounts)]
pub struct MoveBond<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [FORWARDER_SEED, authority.key().as_ref()],
        bump = forwarder.bump,
        has_one = authority @ ManifestError::NotForwarder,
        has_one = bond_mint @ ManifestError::MintNotAllowed,
        has_one = bond_vault @ ManifestError::AccountMismatch
    )]
    pub forwarder: Box<Account<'info, Forwarder>>,

    #[account(mint::token_program = token_program)]
    pub bond_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut)]
    pub bond_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The forwarder's own token account for the bond mint.
    #[account(
        mut,
        token::mint = bond_mint,
        token::authority = authority,
        token::token_program = token_program
    )]
    pub authority_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_deposit_bond(ctx: Context<MoveBond>, amount: u64) -> Result<()> {
    require!(amount > 0, ManifestError::ZeroAmount);
    let a = &ctx.accounts;
    token::transfer(
        &a.token_program.to_account_info(),
        &a.authority_token_account.to_account_info(),
        &a.bond_mint.to_account_info(),
        &a.bond_vault.to_account_info(),
        &a.authority.to_account_info(),
        amount,
        a.bond_mint.decimals,
        &[],
    )?;

    let forwarder = &mut ctx.accounts.forwarder;
    forwarder.bond_balance = math::add(forwarder.bond_balance, amount)?;
    emit!(BondDeposited {
        forwarder: forwarder.key(),
        amount,
        bond_balance: forwarder.bond_balance,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

pub fn handle_withdraw_bond(ctx: Context<MoveBond>, amount: u64) -> Result<()> {
    require!(amount > 0, ManifestError::ZeroAmount);
    let remaining = ctx
        .accounts
        .forwarder
        .bond_balance
        .checked_sub(amount)
        .ok_or_else(|| error!(ManifestError::BondBelowCoverage))?;
    require!(
        remaining >= ctx.accounts.forwarder.locked_coverage,
        ManifestError::BondBelowCoverage
    );

    let a = &ctx.accounts;
    // The bond vault is owned by the forwarder PDA, so the PDA "signs" via its seeds.
    let authority_key = a.authority.key();
    let seeds: &[&[u8]] = &[FORWARDER_SEED, authority_key.as_ref(), &[a.forwarder.bump]];
    token::transfer(
        &a.token_program.to_account_info(),
        &a.bond_vault.to_account_info(),
        &a.bond_mint.to_account_info(),
        &a.authority_token_account.to_account_info(),
        &a.forwarder.to_account_info(),
        amount,
        a.bond_mint.decimals,
        &[seeds],
    )?;

    let forwarder = &mut ctx.accounts.forwarder;
    forwarder.bond_balance = remaining;
    emit!(BondWithdrawn {
        forwarder: forwarder.key(),
        amount,
        bond_balance: remaining,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
