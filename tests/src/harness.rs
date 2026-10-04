//! Test harness: a LiteSVM instance with the Manifest program, SPL Token, Token-2022 and
//! the ATA program, plus helpers for mints, token accounts, clock warping, account
//! decoding and error assertions.

use std::path::PathBuf;

use anchor_lang::{
    prelude::Pubkey, solana_program::instruction::Instruction, AccountDeserialize, InstructionData,
    ToAccountMetas,
};
use anchor_spl::{
    associated_token::{
        get_associated_token_address_with_program_id,
        spl_associated_token_account::instruction::create_associated_token_account,
    },
    token::spl_token,
    token_2022::spl_token_2022,
};
use litesvm::{
    types::{FailedTransactionMetadata, TransactionMetadata},
    LiteSVM,
};
use manifest::errors::ManifestError;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;

pub const ONE_SOL: u64 = 1_000_000_000;
/// One dollar in 6-decimal base units.
pub const USD: u64 = 1_000_000;
pub const DECIMALS: u8 = 6;

pub type TxResult = Result<TransactionMetadata, FailedTransactionMetadata>;

pub struct Svm {
    pub svm: LiteSVM,
}

/// Path to the program binary produced by `anchor build`.
fn program_so_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../target/deploy/manifest.so")
}

/// A LiteSVM instance with the Manifest program deployed at `manifest::ID`.
pub fn svm_with_program() -> LiteSVM {
    let path = program_so_path();
    let bytes = std::fs::read(&path).unwrap_or_else(|err| {
        panic!(
            "could not read {} ({err}); run `anchor build` before the tests",
            path.display()
        )
    });
    let mut svm = LiteSVM::new();
    svm.add_program(manifest::ID, &bytes)
        .expect("program should load into LiteSVM");
    svm
}

/// The upgradeable loader's ProgramData address for our program.
pub fn program_data_address() -> Pubkey {
    Pubkey::find_program_address(
        &[manifest::ID.as_ref()],
        &anchor_lang::solana_program::bpf_loader_upgradeable::ID,
    )
    .0
}

impl Svm {
    pub fn new() -> Self {
        Self {
            svm: svm_with_program(),
        }
    }

    /// LiteSVM deploys with no upgrade authority; rewrite the ProgramData header so
    /// `authority` is the upgrade authority (layout: u32 tag, u64 slot, Option<Pubkey>).
    pub fn set_upgrade_authority(&mut self, authority: &Pubkey) {
        let address = program_data_address();
        let mut account = self.svm.get_account(&address).expect("programdata exists");
        account.data[12] = 1;
        account.data[13..45].copy_from_slice(authority.as_ref());
        self.svm.set_account(address, account).unwrap();
    }

    pub fn funded_keypair(&mut self) -> Keypair {
        let kp = Keypair::new();
        self.svm.airdrop(&kp.pubkey(), 100 * ONE_SOL).unwrap();
        kp
    }

    pub fn send(&mut self, ixs: &[Instruction], payer: &Keypair, signers: &[&Keypair]) -> TxResult {
        let mut all: Vec<&Keypair> = vec![payer];
        for s in signers {
            if s.pubkey() != payer.pubkey() {
                all.push(s);
            }
        }
        let blockhash = self.svm.latest_blockhash();
        let msg = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &blockhash);
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &all).unwrap();
        let res = self.svm.send_transaction(tx);
        // A fresh blockhash per tx lets identical transactions be sent twice.
        self.svm.expire_blockhash();
        res
    }

    /// Build a Manifest instruction from Anchor's generated types.
    pub fn ix(data: impl InstructionData, accounts: impl ToAccountMetas) -> Instruction {
        Instruction::new_with_bytes(manifest::ID, &data.data(), accounts.to_account_metas(None))
    }

    // ---- clock ----

    pub fn now(&self) -> i64 {
        self.svm
            .get_sysvar::<anchor_lang::solana_program::clock::Clock>()
            .unix_timestamp
    }

    pub fn warp(&mut self, seconds: i64) {
        let mut clock = self
            .svm
            .get_sysvar::<anchor_lang::solana_program::clock::Clock>();
        clock.unix_timestamp += seconds;
        clock.slot += 1;
        self.svm.set_sysvar(&clock);
    }

    // ---- accounts ----

    pub fn account<T: AccountDeserialize>(&self, address: &Pubkey) -> T {
        let account = self
            .svm
            .get_account(address)
            .unwrap_or_else(|| panic!("account {address} not found"));
        T::try_deserialize(&mut account.data.as_slice()).expect("decode account")
    }

    pub fn exists(&self, address: &Pubkey) -> bool {
        self.svm
            .get_account(address)
            .is_some_and(|a| a.lamports > 0)
    }

    // ---- tokens ----

    /// Create a mint with `authority` as mint authority under `token_program`.
    pub fn create_mint(
        &mut self,
        authority: &Keypair,
        decimals: u8,
        token_program: &Pubkey,
    ) -> Pubkey {
        let mint = Keypair::new();
        let rent = self.svm.minimum_balance_for_rent_exemption(82);
        let create = anchor_lang::solana_program::system_instruction::create_account(
            &authority.pubkey(),
            &mint.pubkey(),
            rent,
            82,
            token_program,
        );
        let init = spl_token_2022::instruction::initialize_mint2(
            token_program,
            &mint.pubkey(),
            &authority.pubkey(),
            None,
            decimals,
        )
        .unwrap();
        self.send(&[create, init], authority, &[&mint]).unwrap();
        mint.pubkey()
    }

    pub fn ata(owner: &Pubkey, mint: &Pubkey, token_program: &Pubkey) -> Pubkey {
        get_associated_token_address_with_program_id(owner, mint, token_program)
    }

    pub fn create_ata(
        &mut self,
        payer: &Keypair,
        owner: &Pubkey,
        mint: &Pubkey,
        token_program: &Pubkey,
    ) -> Pubkey {
        let ix = create_associated_token_account(&payer.pubkey(), owner, mint, token_program);
        self.send(&[ix], payer, &[]).unwrap();
        Self::ata(owner, mint, token_program)
    }

    pub fn mint_to(
        &mut self,
        mint_authority: &Keypair,
        mint: &Pubkey,
        to: &Pubkey,
        amount: u64,
        token_program: &Pubkey,
    ) {
        let ix = spl_token_2022::instruction::mint_to(
            token_program,
            mint,
            to,
            &mint_authority.pubkey(),
            &[],
            amount,
        )
        .unwrap();
        self.send(&[ix], mint_authority, &[]).unwrap();
    }

    /// Token account balance (amount lives at bytes 64..72 for both token programs).
    pub fn balance(&self, token_account: &Pubkey) -> u64 {
        self.svm.get_account(token_account).map_or(0, |a| {
            u64::from_le_bytes(a.data[64..72].try_into().unwrap())
        })
    }

    /// Token account owner (bytes 32..64).
    pub fn token_owner(&self, token_account: &Pubkey) -> Pubkey {
        let a = self.svm.get_account(token_account).expect("token account");
        Pubkey::try_from(&a.data[32..64]).unwrap()
    }
}

pub fn spl_token_id() -> Pubkey {
    spl_token::ID
}

pub fn token_2022_id() -> Pubkey {
    spl_token_2022::ID
}

/// Assert the transaction failed with this Manifest error code.
#[track_caller]
pub fn assert_manifest_err(result: TxResult, expected: ManifestError) {
    assert_custom_err(result, u32::from(expected), &format!("{expected:?}"));
}

/// Assert the transaction failed with this Anchor framework error code.
#[track_caller]
pub fn assert_anchor_err(result: TxResult, expected: anchor_lang::error::ErrorCode) {
    assert_custom_err(result, u32::from(expected), &format!("{expected:?}"));
}

#[track_caller]
fn assert_custom_err(result: TxResult, code: u32, name: &str) {
    use solana_instruction_error::InstructionError;
    use solana_transaction_error::TransactionError;
    match result {
        Ok(_) => panic!("expected {name} ({code}) but the transaction succeeded"),
        Err(failed) => match &failed.err {
            TransactionError::InstructionError(_, InstructionError::Custom(actual))
                if *actual == code => {}
            other => panic!(
                "expected {name} ({code}), got {other:?}\nlogs:\n{}",
                failed.meta.logs.join("\n")
            ),
        },
    }
}

/// Zero-padded fixed-size byte array from a string.
pub fn fixed<const N: usize>(s: &str) -> [u8; N] {
    let mut out = [0u8; N];
    out[..s.len()].copy_from_slice(s.as_bytes());
    out
}
