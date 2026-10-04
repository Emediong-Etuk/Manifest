//! initialize_config / update_config / transfer_admin.

use anchor_lang::prelude::Pubkey;
use manifest::errors::ManifestError;
use solana_keypair::Keypair;
use solana_signer::Signer;

use crate::fixtures::*;
use crate::harness::*;

#[test]
fn initialize_config_stores_params_and_admin() {
    let w = World::new();
    let c = w.config();
    assert_eq!(c.version, 1);
    assert_eq!(c.admin, w.admin.pubkey());
    assert_eq!(c.arbitrator, w.arbitrator.pubkey());
    assert_eq!(c.treasury_owner, w.treasury.pubkey());
    assert_eq!(c.payment_mints[0], w.usd);
    assert_eq!(c.fee_bps, 75);
    assert_eq!(c.review_window_secs, REVIEW_WINDOW);
    assert!(!c.paused);
    let (_, ticket_bump) =
        Pubkey::find_program_address(&[manifest::constants::TICKET_AUTHORITY_SEED], &manifest::ID);
    assert_eq!(c.ticket_authority_bump, ticket_bump);
}

#[test]
fn initialize_config_requires_upgrade_authority() {
    let mut w = World::bare();
    let params = w.default_params();
    // Someone other than the upgrade authority tries to initialize first.
    let intruder = w.s.funded_keypair();
    w.admin = intruder;
    let res = w.initialize_config(&params, &[w.usd]);
    assert_anchor_err(res, anchor_lang::error::ErrorCode::ConstraintRaw);
}

#[test]
fn initialize_config_cannot_run_twice() {
    let mut w = World::new();
    let params = w.default_params();
    assert!(w.initialize_config(&params, &[w.usd]).is_err());
}

#[test]
fn initialize_config_rejects_bps_above_100_percent() {
    let mut w = World::bare();
    let mut params = w.default_params();
    params.coverage_bps = 10_001;
    let res = w.initialize_config(&params, &[w.usd]);
    assert_manifest_err(res, ManifestError::InvalidBps);
}

#[test]
fn initialize_config_rejects_zero_windows() {
    let mut w = World::bare();
    let mut params = w.default_params();
    params.review_window_secs = 0;
    let res = w.initialize_config(&params, &[w.usd]);
    assert_manifest_err(res, ManifestError::InvalidWindow);
}

#[test]
fn initialize_config_rejects_mint_without_six_decimals() {
    let mut w = World::bare();
    let admin = w.admin.insecure_clone();
    let nine = w.s.create_mint(&admin, 9, &spl_token_id());
    let mut params = w.default_params();
    params.payment_mints[1] = nine;
    let res = w.initialize_config(&params, &[w.usd, nine]);
    assert_manifest_err(res, ManifestError::InvalidMintDecimals);
}

#[test]
fn initialize_config_requires_mint_accounts() {
    let mut w = World::bare();
    let params = w.default_params();
    let res = w.initialize_config(&params, &[]);
    assert_manifest_err(res, ManifestError::InvalidMintAccount);
}

#[test]
fn initialize_config_rejects_empty_mint_lists() {
    let mut w = World::bare();
    let mut params = w.default_params();
    params.bond_mints = [Pubkey::default(); 4];
    let res = w.initialize_config(&params, &[w.usd]);
    assert_manifest_err(res, ManifestError::NoMintsConfigured);
}

#[test]
fn initialize_config_accepts_token_2022_mints() {
    let mut w = World::bare();
    let admin = w.admin.insecure_clone();
    let t22 = w.s.create_mint(&admin, DECIMALS, &token_2022_id());
    let mut params = w.default_params();
    params.payment_mints[1] = t22;
    w.initialize_config(&params, &[w.usd, t22]).unwrap();
    assert_eq!(w.config().payment_mints[1], t22);
}

#[test]
fn update_config_changes_fields_and_can_pause() {
    let mut w = World::new();
    let admin = w.admin.insecure_clone();
    let mut params = w.default_params();
    params.fee_bps = 100;
    params.paused = true;
    w.update_config_as(&admin, &params, &[w.usd]).unwrap();
    let c = w.config();
    assert_eq!(c.fee_bps, 100);
    assert!(c.paused);
    assert_eq!(c.admin, admin.pubkey());
}

#[test]
fn update_config_rejects_non_admin() {
    let mut w = World::new();
    let stranger = w.s.funded_keypair();
    let params = w.default_params();
    let res = w.update_config_as(&stranger, &params, &[w.usd]);
    assert_anchor_err(res, anchor_lang::error::ErrorCode::ConstraintHasOne);
}

#[test]
fn transfer_admin_hands_over_control() {
    let mut w = World::new();
    let old = w.admin.insecure_clone();
    let new_admin = w.s.funded_keypair();
    transfer_admin(&mut w, &old, new_admin.pubkey()).unwrap();
    assert_eq!(w.config().admin, new_admin.pubkey());

    // The old admin can no longer update; the new one can.
    let params = w.default_params();
    assert!(w.update_config_as(&old, &params, &[w.usd]).is_err());
    w.update_config_as(&new_admin, &params, &[w.usd]).unwrap();
}

#[test]
fn transfer_admin_rejects_default_pubkey() {
    let mut w = World::new();
    let admin = w.admin.insecure_clone();
    let res = transfer_admin(&mut w, &admin, Pubkey::default());
    assert_manifest_err(res, ManifestError::AccountMismatch);
}

fn transfer_admin(w: &mut World, signer: &Keypair, new_admin: Pubkey) -> TxResult {
    let ix = Svm::ix(
        manifest::instruction::TransferAdmin { new_admin },
        manifest::accounts::TransferAdmin {
            admin: signer.pubkey(),
            config: config_pda(),
        },
    );
    w.s.send(&[ix], signer, &[])
}
