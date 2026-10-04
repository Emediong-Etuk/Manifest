//! register_forwarder / deposit_bond / withdraw_bond.

use manifest::errors::ManifestError;
use solana_signer::Signer;

use crate::fixtures::*;
use crate::harness::*;

#[test]
fn register_forwarder_creates_profile_and_bond_vault() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 0);
    let state = w.forwarder_state(&f);
    assert_eq!(state.version, 1);
    assert_eq!(state.authority, f.kp.pubkey());
    assert_eq!(&state.name[..14], b"Eastline Cargo");
    assert_eq!(state.bond_mint, w.usd);
    assert_eq!(state.bond_vault, f.vault);
    assert_eq!(state.bond_balance, 0);
    assert_eq!(state.container_count, 0);
    // The bond vault is a token account owned by the forwarder PDA.
    assert_eq!(w.s.token_owner(&f.vault), f.pda);
}

#[test]
fn register_forwarder_rejects_disallowed_bond_mint() {
    let mut w = World::new();
    let admin = w.admin.insecure_clone();
    let other = w.s.create_mint(&admin, DECIMALS, &spl_token_id());
    let kp = w.s.funded_keypair();
    let res = w.register_forwarder_tx(&kp, "Rogue", other);
    assert_manifest_err(res, ManifestError::MintNotAllowed);
}

#[test]
fn register_forwarder_rejects_empty_name() {
    let mut w = World::new();
    let kp = w.s.funded_keypair();
    let usd = w.usd;
    let res = w.register_forwarder_tx(&kp, "", usd);
    assert_manifest_err(res, ManifestError::InvalidString);
}

#[test]
fn register_forwarder_cannot_register_twice() {
    let mut w = World::new();
    let kp = w.s.funded_keypair();
    let usd = w.usd;
    w.register_forwarder_tx(&kp, "Once", usd).unwrap();
    assert!(w.register_forwarder_tx(&kp, "Twice", usd).is_err());
}

#[test]
fn deposit_bond_moves_tokens_and_updates_balance() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 5_000 * USD);
    assert_eq!(w.s.balance(&f.vault), 5_000 * USD);
    assert_eq!(w.s.balance(&f.ata), 0);
    assert_eq!(w.forwarder_state(&f).bond_balance, 5_000 * USD);
}

#[test]
fn deposit_bond_rejects_zero() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 0);
    let res = w.move_bond(&f, 0, true);
    assert_manifest_err(res, ManifestError::ZeroAmount);
}

#[test]
fn withdraw_bond_returns_unlocked_tokens() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 1_000 * USD);
    w.move_bond(&f, 400 * USD, false).unwrap();
    assert_eq!(w.s.balance(&f.vault), 600 * USD);
    assert_eq!(w.s.balance(&f.ata), 400 * USD);
    assert_eq!(w.forwarder_state(&f).bond_balance, 600 * USD);
}

#[test]
fn withdraw_bond_rejects_more_than_balance() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 100 * USD);
    let res = w.move_bond(&f, 101 * USD, false);
    assert_manifest_err(res, ManifestError::BondBelowCoverage);
}

#[test]
fn bond_instructions_reject_other_wallets() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 100 * USD);
    let thief = w.s.funded_keypair();
    let thief_ata = w.fund_usd(&thief.pubkey(), 0);
    let stolen = Fwd {
        kp: thief,
        pda: f.pda,
        vault: f.vault,
        ata: thief_ata,
    };
    // The forwarder PDA's seeds are derived from the signer, so a different signer
    // fails the seeds check before anything else.
    assert_anchor_err(
        w.move_bond(&stolen, 10 * USD, false),
        anchor_lang::error::ErrorCode::ConstraintSeeds,
    );
}
