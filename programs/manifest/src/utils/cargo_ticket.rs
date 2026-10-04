//! Cargo Ticket: a Token-2022 NFT (decimals 0, supply 1) proving the right to collect
//! one consignment.
//!
//! The mint itself is created by Anchor's `init` constraint in the instruction's
//! accounts struct, with two extensions:
//! - MetadataPointer -> the mint itself, so name/symbol/uri live inside the mint account;
//! - PermanentDelegate -> the program's `["ticket_authority"]` PDA, so the program can
//!   burn the ticket at settlement or after a slash without the holder signing.
//!   Only the two documented settlement paths (Phase 2) ever use it.
//!
//! This module then writes the TokenMetadata, mints exactly 1 to the trader and removes
//! the mint authority, so no second ticket can ever exist.
//! Reference: https://solana.com/docs/tokens/extensions (metadata + metadata pointer).

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_2022::spl_token_2022::instruction::AuthorityType;
use anchor_spl::token_interface::{
    self, Burn, CloseAccount, MintTo, SetAuthority, TokenMetadataInitialize,
};

use crate::constants::{CARGO_TICKET_NAME_PREFIX, CARGO_TICKET_SYMBOL};

/// Accounts needed to finish a Cargo Ticket after Anchor created the mint and the
/// holder's associated token account.
pub struct CargoTicketAccounts<'a, 'info> {
    pub payer: &'a AccountInfo<'info>,
    pub mint: &'a AccountInfo<'info>,
    pub holder_token_account: &'a AccountInfo<'info>,
    pub ticket_authority: &'a AccountInfo<'info>,
    pub token_2022_program: &'a AccountInfo<'info>,
    pub system_program: &'a AccountInfo<'info>,
}

/// Bytes the TokenMetadata TLV entry adds to the mint account:
/// 2 (type) + 2 (length) + 32 (update authority) + 32 (mint)
/// + 4+name + 4+symbol + 4+uri (Borsh strings) + 4 (empty additional_metadata vec).
fn metadata_tlv_len(name: &str, symbol: &str, uri: &str) -> usize {
    4 + 32 + 32 + 4 + name.len() + 4 + symbol.len() + 4 + uri.len() + 4
}

/// Ticket display name, e.g. `Manifest Cargo Ticket LAG-1014-2`.
pub fn ticket_name(container_code: &str, index: u16) -> String {
    format!("{CARGO_TICKET_NAME_PREFIX}{container_code}-{index}")
}

/// Write metadata, mint 1 ticket to the holder, and revoke the mint authority.
/// `authority_seeds` are the `["ticket_authority", bump]` signer seeds.
pub fn finish_cargo_ticket(
    accounts: CargoTicketAccounts<'_, '_>,
    name: String,
    uri: String,
    authority_seeds: &[&[&[u8]]],
) -> Result<()> {
    let symbol = CARGO_TICKET_SYMBOL.to_string();

    // 1. Top up rent: Token-2022 grows the mint account to hold the metadata TLV entry,
    //    and the account must stay rent-exempt at its new size.
    let new_len = accounts
        .mint
        .data_len()
        .saturating_add(metadata_tlv_len(&name, &symbol, &uri));
    let required = Rent::get()?.minimum_balance(new_len);
    let shortfall = required.saturating_sub(accounts.mint.lamports());
    if shortfall > 0 {
        system_program::transfer(
            CpiContext::new(
                system_program::ID,
                system_program::Transfer {
                    from: accounts.payer.clone(),
                    to: accounts.mint.clone(),
                },
            ),
            shortfall,
        )?;
    }

    // 2. Write name / symbol / uri into the mint (ticket_authority is mint authority and
    //    update authority).
    token_interface::token_metadata_initialize(
        CpiContext::new_with_signer(
            accounts.token_2022_program.key(),
            TokenMetadataInitialize {
                program_id: accounts.token_2022_program.clone(),
                metadata: accounts.mint.clone(),
                update_authority: accounts.ticket_authority.clone(),
                mint_authority: accounts.ticket_authority.clone(),
                mint: accounts.mint.clone(),
            },
            authority_seeds,
        ),
        name,
        symbol,
        uri,
    )?;

    // 3. Mint exactly one ticket to the holder.
    token_interface::mint_to(
        CpiContext::new_with_signer(
            accounts.token_2022_program.key(),
            MintTo {
                mint: accounts.mint.clone(),
                to: accounts.holder_token_account.clone(),
                authority: accounts.ticket_authority.clone(),
            },
            authority_seeds,
        ),
        1,
    )?;

    // 4. Remove the mint authority forever: supply is now fixed at 1.
    token_interface::set_authority(
        CpiContext::new_with_signer(
            accounts.token_2022_program.key(),
            SetAuthority {
                current_authority: accounts.ticket_authority.clone(),
                account_or_mint: accounts.mint.clone(),
            },
            authority_seeds,
        ),
        AuthorityType::MintTokens,
        None,
    )
}

/// Burn the single ticket. `authority` is either the holder (who signs the transaction)
/// or the `["ticket_authority"]` permanent delegate (pass its `signer_seeds`).
pub fn burn_ticket<'info>(
    token_2022_program: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    holder_token_account: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    token_interface::burn(
        CpiContext::new_with_signer(
            token_2022_program.key(),
            Burn {
                mint: mint.clone(),
                from: holder_token_account.clone(),
                authority: authority.clone(),
            },
            signer_seeds,
        ),
        1,
    )
}

/// Close the holder's now-empty ticket token account and return its rent to them.
/// Only possible when the holder signs.
pub fn close_ticket_account<'info>(
    token_2022_program: &AccountInfo<'info>,
    holder_token_account: &AccountInfo<'info>,
    holder: &AccountInfo<'info>,
) -> Result<()> {
    token_interface::close_account(CpiContext::new(
        token_2022_program.key(),
        CloseAccount {
            account: holder_token_account.clone(),
            destination: holder.clone(),
            authority: holder.clone(),
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn name_includes_container_code_and_index() {
        assert_eq!(
            ticket_name("LAG-1014", 2),
            "Manifest Cargo Ticket LAG-1014-2"
        );
    }

    #[test]
    fn tlv_len_counts_every_field() {
        assert_eq!(metadata_tlv_len("", "", ""), 84);
        assert_eq!(metadata_tlv_len("ab", "c", "def"), 90);
    }
}
