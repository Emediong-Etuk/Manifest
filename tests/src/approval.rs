//! approve_goods / auto_approve: payee payout, fee, freight re-pricing, Cargo Ticket.

use anchor_lang::prelude::Pubkey;
use anchor_spl::token_2022::spl_token_2022::{
    extension::{
        metadata_pointer::MetadataPointer, permanent_delegate::PermanentDelegate,
        BaseStateWithExtensions, StateWithExtensions,
    },
    state::Mint as MintState,
};
use anchor_spl::token_interface::spl_token_metadata_interface::state::TokenMetadata;
use manifest::errors::ManifestError;
use manifest::state::ConsignmentStatus;
use solana_signer::Signer;

use crate::fixtures::*;
use crate::harness::*;

struct Booked {
    w: World,
    f: Fwd,
    c: Pubkey,
    t: Trader,
    k: Pubkey,
}

/// A consignment booked (1.25 CBM est.) and received at `measured` milli-CBM.
fn received(measured: u32) -> Booked {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 5_000 * USD);
    let c = w.container(&f);
    let t = w.trader(10_000 * USD);
    let k = w.book(&t, c);
    w.record_receipt_tx(&f, k, measured, 12).unwrap();
    Booked { w, f, c, t, k }
}

/// Every Cargo Ticket property from spec 5.2 / invariant 6.
#[track_caller]
fn assert_cargo_ticket(w: &World, k: &Pubkey, holder: &Pubkey) {
    let ticket = cargo_ticket_pda(k);
    assert_eq!(w.consignment_state(k).cargo_ticket_mint, ticket);

    let account = w.s.svm.get_account(&ticket).expect("ticket mint exists");
    assert_eq!(account.owner, token_2022_id());
    let mint = StateWithExtensions::<MintState>::unpack(&account.data).unwrap();
    assert_eq!(mint.base.decimals, 0);
    assert_eq!(mint.base.supply, 1);
    assert!(
        mint.base.mint_authority.is_none(),
        "mint authority must be revoked"
    );
    assert!(mint.base.freeze_authority.is_none());

    let authority = ticket_authority_pda();
    let pointer = mint.get_extension::<MetadataPointer>().unwrap();
    assert_eq!(pointer.metadata_address.0.as_ref(), ticket.as_ref());
    let delegate = mint.get_extension::<PermanentDelegate>().unwrap();
    assert_eq!(delegate.delegate.0.as_ref(), authority.as_ref());

    let metadata = mint.get_variable_len_extension::<TokenMetadata>().unwrap();
    let index = w.consignment_state(k).index;
    assert_eq!(
        metadata.name,
        format!("Manifest Cargo Ticket LAG-1014-{index}")
    );
    assert_eq!(metadata.symbol, "MCT");
    assert_eq!(
        metadata.uri,
        format!("https://manifest.app/api/tickets/{k}")
    );

    // Exactly one ticket, held by the holder's Token-2022 associated token account.
    let holder_ata = Svm::ata(holder, &ticket, &token_2022_id());
    assert_eq!(w.s.balance(&holder_ata), 1);
    assert_eq!(w.s.token_owner(&holder_ata), *holder);
}

#[test]
fn approve_goods_pays_supplier_fee_refunds_excess_freight_and_mints_ticket() {
    // Measured 1.000 CBM < 1.250 estimated: freight due $380, escrowed $522.50.
    let Booked { mut w, f, c, t, k } = received(1_000);
    let state = w.consignment_state(&k);
    let trader_before = w.s.balance(&t.ata);
    let kp = t.kp.insecure_clone();

    let meta = w.approve_tx(&kp, k).unwrap();
    println!(
        "approve_goods compute units: {}",
        meta.compute_units_consumed
    );

    let payee_ata = Svm::ata(&state.payee, &w.usd, &spl_token_id());
    let treasury_ata = Svm::ata(&w.treasury.pubkey(), &w.usd, &spl_token_id());
    assert_eq!(w.s.balance(&payee_ata), GOODS);
    assert_eq!(w.s.balance(&treasury_ata), 18 * USD);
    assert_eq!(w.s.balance(&t.ata), trader_before + 142_500_000);
    assert_eq!(w.s.balance(&state.vault), 380 * USD);

    let after = w.consignment_state(&k);
    assert_eq!(after.status, ConsignmentStatus::Approved);
    assert_eq!(after.freight_due, 380 * USD);
    assert_eq!(after.freight_escrowed, 380 * USD);
    assert_eq!(after.approved_at, w.s.now());
    assert_eq!(w.container_state(&c).approved_count, 1);
    w.assert_vault_matches_state(&k);
    w.assert_bond_covers(&f);
    assert_cargo_ticket(&w, &k, &t.kp.pubkey());
}

#[test]
fn approve_with_measured_above_estimate_leaves_freight_short() {
    // Measured 1.500 CBM > 1.375 CBM covered by the buffer: due $570, escrowed $522.50.
    let Booked { mut w, t, k, .. } = received(1_500);
    let trader_before = w.s.balance(&t.ata);
    let kp = t.kp.insecure_clone();
    w.approve_tx(&kp, k).unwrap();
    let after = w.consignment_state(&k);
    assert_eq!(after.freight_due, 570 * USD);
    assert_eq!(after.freight_escrowed, 522_500_000);
    assert_eq!(
        w.s.balance(&t.ata),
        trader_before,
        "no refund when freight is short"
    );
    w.assert_vault_matches_state(&k);
}

#[test]
fn auto_approve_after_review_window_by_anyone() {
    let Booked { mut w, t, k, .. } = received(1_250);
    let crank = w.s.funded_keypair();

    // Too early: the trader still has time to review.
    assert_manifest_err(
        w.auto_approve_tx(&crank, k),
        ManifestError::ReviewWindowOpen,
    );

    w.s.warp(REVIEW_WINDOW + 1);
    let meta = w.auto_approve_tx(&crank, k).unwrap();
    println!(
        "auto_approve compute units: {}",
        meta.compute_units_consumed
    );
    assert!(
        meta.logs.iter().any(|l| l.contains("Program data:")),
        "event emitted"
    );

    let after = w.consignment_state(&k);
    assert_eq!(after.status, ConsignmentStatus::Approved);
    // 1.250 CBM measured == estimate: due $475, refund the $47.50 buffer.
    assert_eq!(after.freight_due, 475 * USD);
    assert_eq!(after.freight_escrowed, 475 * USD);
    // The ticket goes to the trader, not the cranker.
    assert_cargo_ticket(&w, &k, &t.kp.pubkey());
}

#[test]
fn approve_rejects_non_trader() {
    let Booked { mut w, k, .. } = received(1_000);
    let stranger = w.s.funded_keypair();
    assert_manifest_err(w.approve_tx(&stranger, k), ManifestError::NotTrader);
}

#[test]
fn approve_before_receipt_fails() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 5_000 * USD);
    let c = w.container(&f);
    let t = w.trader(10_000 * USD);
    let k = w.book(&t, c);
    let kp = t.kp.insecure_clone();
    assert_manifest_err(
        w.approve_tx(&kp, k),
        ManifestError::InvalidConsignmentStatus,
    );
    let crank = w.s.funded_keypair();
    assert_manifest_err(
        w.auto_approve_tx(&crank, k),
        ManifestError::InvalidConsignmentStatus,
    );
}

#[test]
fn manual_approve_after_review_deadline_fails() {
    let Booked { mut w, t, k, .. } = received(1_000);
    w.s.warp(REVIEW_WINDOW + 1);
    let kp = t.kp.insecure_clone();
    assert_manifest_err(w.approve_tx(&kp, k), ManifestError::ReviewWindowClosed);
}

#[test]
fn double_approval_fails() {
    let Booked { mut w, t, k, .. } = received(1_000);
    let kp = t.kp.insecure_clone();
    w.approve_tx(&kp, k).unwrap();
    // The ticket mint already exists, so the second approval can't even create it.
    assert!(w.approve_tx(&kp, k).is_err());
    w.s.warp(REVIEW_WINDOW + 1);
    let crank = w.s.funded_keypair();
    assert!(w.auto_approve_tx(&crank, k).is_err());
    assert_eq!(
        w.container_state(&w.consignment_state(&k).container)
            .approved_count,
        1
    );
}

#[test]
fn disputed_consignment_cannot_be_approved() {
    let Booked { mut w, t, k, .. } = received(1_000);
    let kp = t.kp.insecure_clone();
    w.reject_goods_tx(&kp, k, 1).unwrap();
    assert_manifest_err(
        w.approve_tx(&kp, k),
        ManifestError::InvalidConsignmentStatus,
    );
    w.s.warp(REVIEW_WINDOW + 1);
    let crank = w.s.funded_keypair();
    assert_manifest_err(
        w.auto_approve_tx(&crank, k),
        ManifestError::InvalidConsignmentStatus,
    );
}

#[test]
fn settlement_rejects_substituted_treasury() {
    let Booked { mut w, t, k, .. } = received(1_000);
    let kp = t.kp.insecure_clone();
    let mut accounts = w.settle_accounts(&kp.pubkey(), k);
    let attacker = w.s.funded_keypair();
    accounts.treasury_owner = attacker.pubkey();
    accounts.treasury_token_account = Svm::ata(&attacker.pubkey(), &w.usd, &spl_token_id());
    let ix = Svm::ix(manifest::instruction::ApproveGoods {}, accounts);
    let res = w.s.send(&with_cu_limit(ix), &kp, &[]);
    assert_manifest_err(res, ManifestError::AccountMismatch);
}

#[test]
fn settlement_rejects_substituted_payee() {
    let Booked { mut w, t, k, .. } = received(1_000);
    let kp = t.kp.insecure_clone();
    let mut accounts = w.settle_accounts(&kp.pubkey(), k);
    let attacker = w.s.funded_keypair();
    accounts.payee = attacker.pubkey();
    accounts.payee_token_account = Svm::ata(&attacker.pubkey(), &w.usd, &spl_token_id());
    let ix = Svm::ix(manifest::instruction::ApproveGoods {}, accounts);
    let res = w.s.send(&with_cu_limit(ix), &kp, &[]);
    assert_manifest_err(res, ManifestError::AccountMismatch);
}
