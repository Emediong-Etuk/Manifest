//! book_consignment / record_receipt / reject_booking / refund_after_cutoff / reject_goods.

use anchor_lang::prelude::Pubkey;
use manifest::errors::ManifestError;
use manifest::state::ConsignmentStatus;
use solana_keypair::Keypair;
use solana_signer::Signer;

use crate::fixtures::*;
use crate::harness::*;

/// $2,400 goods + $18 fee (0.75%) + $522.50 freight (1.25 CBM x $380 + 10%).
const TOTAL_LOCKED: u64 = 2_940_500_000;
const COVERAGE: u64 = 480 * USD;

fn setup() -> (World, Fwd, Pubkey, Trader) {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 5_000 * USD);
    let c = w.container(&f);
    let t = w.trader(10_000 * USD);
    (w, f, c, t)
}

#[test]
fn book_consignment_locks_goods_fee_and_buffered_freight() {
    let (mut w, f, c, t) = setup();
    let payee = Keypair::new().pubkey();
    let params = w.book_params(payee);
    let k = w.book_with(&t, c, params);

    let state = w.consignment_state(&k);
    assert_eq!(state.trader, t.kp.pubkey());
    assert_eq!(state.payee, payee);
    assert_eq!(state.goods_amount, GOODS);
    assert_eq!(state.fee_amount, 18 * USD);
    assert_eq!(state.freight_escrowed, 522_500_000);
    assert_eq!(state.coverage_locked, COVERAGE);
    assert_eq!(state.status, ConsignmentStatus::Booked);
    assert_eq!(&state.description[..23], b"Phone cases, 12 cartons");

    assert_eq!(w.s.balance(&state.vault), TOTAL_LOCKED);
    assert_eq!(w.s.balance(&t.ata), 10_000 * USD - TOTAL_LOCKED);
    assert_eq!(w.s.token_owner(&state.vault), k);
    w.assert_vault_matches_state(&k);

    let cs = w.container_state(&c);
    assert_eq!(cs.consignment_count, 1);
    assert_eq!(cs.active_count, 1);
    assert_eq!(cs.booked_cbm_milli, EST_CBM);
    assert_eq!(w.forwarder_state(&f).locked_coverage, COVERAGE);
    w.assert_bond_covers(&f);
}

#[test]
fn book_rejected_when_paused() {
    let (mut w, _f, c, t) = setup();
    let admin = w.admin.insecure_clone();
    let mut params = w.default_params();
    params.paused = true;
    let usd = w.usd;
    w.update_config_as(&admin, &params, &[usd]).unwrap();
    let p = w.book_params(Keypair::new().pubkey());
    assert_manifest_err(w.book_tx(&t, c, p), ManifestError::Paused);
}

#[test]
fn book_rejected_after_cutoff() {
    let (mut w, _f, c, t) = setup();
    w.s.warp(10 * DAY);
    let p = w.book_params(Keypair::new().pubkey());
    assert_manifest_err(w.book_tx(&t, c, p), ManifestError::BookingClosed);
}

#[test]
fn book_rejected_when_container_closed() {
    let (mut w, f, c, t) = setup();
    let kp = f.kp.insecure_clone();
    w.close_booking_tx(&kp, &f, c).unwrap();
    let p = w.book_params(Keypair::new().pubkey());
    assert_manifest_err(w.book_tx(&t, c, p), ManifestError::InvalidContainerStatus);
}

#[test]
fn book_rejected_beyond_capacity() {
    let (mut w, _f, c, t) = setup();
    let mut p = w.book_params(Keypair::new().pubkey());
    p.est_cbm_milli = CAPACITY + 1;
    assert_manifest_err(w.book_tx(&t, c, p), ManifestError::CapacityExceeded);
}

#[test]
fn book_rejected_beyond_bond_coverage() {
    let mut w = World::new();
    // $500 bond covers 20% of at most $2,500 of open goods.
    let f = w.forwarder("Thin Bond Ltd", 500 * USD);
    let c = w.container(&f);
    let t = w.trader(10_000 * USD);
    w.book(&t, c); // $2,400 goods -> $480 locked.
    let mut p = w.book_params(Keypair::new().pubkey());
    p.goods_amount = 100 * USD + 1; // needs $20.0000002 more coverage; only $20 left.
    assert_manifest_err(w.book_tx(&t, c, p), ManifestError::CoverageExceeded);
    let mut p = w.book_params(Keypair::new().pubkey());
    p.goods_amount = 100 * USD; // exactly fills the bond.
    w.book_tx(&t, c, p).unwrap();
    assert_eq!(w.forwarder_state(&f).locked_coverage, 500 * USD);
    w.assert_bond_covers(&f);
}

#[test]
fn book_rejected_when_mint_removed_from_config() {
    let (mut w, _f, c, t) = setup();
    let admin = w.admin.insecure_clone();
    let other = w.s.create_mint(&admin, DECIMALS, &spl_token_id());
    let mut params = w.default_params();
    params.payment_mints[0] = other;
    let usd = w.usd;
    w.update_config_as(&admin, &params, &[usd, other]).unwrap();
    let p = w.book_params(Keypair::new().pubkey());
    assert_manifest_err(w.book_tx(&t, c, p), ManifestError::MintNotAllowed);
}

#[test]
fn book_rejected_with_zero_goods_or_volume() {
    let (mut w, _f, c, t) = setup();
    let mut p = w.book_params(Keypair::new().pubkey());
    p.goods_amount = 0;
    assert_manifest_err(w.book_tx(&t, c, p), ManifestError::ZeroAmount);
    let mut p = w.book_params(Keypair::new().pubkey());
    p.est_cbm_milli = 0;
    assert_manifest_err(w.book_tx(&t, c, p), ManifestError::ZeroAmount);
}

#[test]
fn book_rejects_invalid_payees() {
    let (mut w, _f, c, t) = setup();
    let treasury = w.treasury.pubkey();
    for payee in [Pubkey::default(), t.kp.pubkey(), treasury] {
        let p = w.book_params(payee);
        assert_manifest_err(w.book_tx(&t, c, p), ManifestError::InvalidPayee);
    }
}

#[test]
fn max_u64_goods_amount_is_rejected_cleanly() {
    let (mut w, _f, c, t) = setup();
    let mut p = w.book_params(Keypair::new().pubkey());
    p.goods_amount = u64::MAX;
    assert_manifest_err(w.book_tx(&t, c, p), ManifestError::CoverageExceeded);

    // With coverage switched off, the total (goods + fee + freight) overflows u64.
    let admin = w.admin.insecure_clone();
    let mut params = w.default_params();
    params.coverage_bps = 0;
    let usd = w.usd;
    w.update_config_as(&admin, &params, &[usd]).unwrap();
    let mut p = w.book_params(Keypair::new().pubkey());
    p.goods_amount = u64::MAX;
    assert_manifest_err(w.book_tx(&t, c, p), ManifestError::MathOverflow);
}

#[test]
fn withdraw_bond_below_locked_coverage_fails() {
    let (mut w, f, c, t) = setup();
    w.book(&t, c); // locks $480 of the $5,000 bond.
    assert_manifest_err(
        w.move_bond(&f, 4_520 * USD + 1, false),
        ManifestError::BondBelowCoverage,
    );
    w.move_bond(&f, 4_520 * USD, false).unwrap();
    w.assert_bond_covers(&f);
}

#[test]
fn record_receipt_stores_evidence_and_starts_review_window() {
    let (mut w, f, c, t) = setup();
    let k = w.book(&t, c);
    let now = w.s.now();
    w.record_receipt_tx(&f, k, 1_000, 12).unwrap();
    let state = w.consignment_state(&k);
    assert_eq!(state.status, ConsignmentStatus::Received);
    assert_eq!(state.evidence_hash, EVIDENCE);
    assert_eq!(state.measured_cbm_milli, 1_000);
    assert_eq!(state.carton_count, 12);
    assert_eq!(state.received_at, now);
    assert_eq!(state.review_deadline, now + REVIEW_WINDOW);
    assert_eq!(w.container_state(&c).received_cbm_milli, 1_000);
    w.assert_vault_matches_state(&k);
}

#[test]
fn record_receipt_rejects_non_forwarder_wrong_status_and_overflow() {
    let (mut w, f, c, t) = setup();
    let k = w.book(&t, c);

    // Another registered forwarder can't record receipts on f's container.
    let g = w.forwarder("Harbour Link", 0);
    assert_manifest_err(
        w.record_receipt_tx(&g, k, 1_000, 12),
        ManifestError::AccountMismatch,
    );

    // Zero volume / cartons are rejected.
    assert_manifest_err(
        w.record_receipt_tx(&f, k, 0, 12),
        ManifestError::InvalidReceipt,
    );
    assert_manifest_err(
        w.record_receipt_tx(&f, k, 1_000, 0),
        ManifestError::InvalidReceipt,
    );

    // Measured volume can't exceed the container's capacity.
    assert_manifest_err(
        w.record_receipt_tx(&f, k, CAPACITY + 1, 12),
        ManifestError::CapacityExceeded,
    );

    // Recording twice fails on status.
    w.record_receipt_tx(&f, k, 1_000, 12).unwrap();
    assert_manifest_err(
        w.record_receipt_tx(&f, k, 1_000, 12),
        ManifestError::InvalidConsignmentStatus,
    );
}

#[test]
fn record_receipt_after_close_is_allowed() {
    let (mut w, f, c, t) = setup();
    let k = w.book(&t, c);
    let kp = f.kp.insecure_clone();
    w.close_booking_tx(&kp, &f, c).unwrap();
    w.record_receipt_tx(&f, k, 1_000, 12).unwrap();
    assert_eq!(w.consignment_state(&k).status, ConsignmentStatus::Received);
}

#[test]
fn forwarder_reject_booking_refunds_in_full() {
    let (mut w, f, c, t) = setup();
    let k = w.book(&t, c);
    w.reject_booking_tx(&f, k).unwrap();

    let state = w.consignment_state(&k);
    assert_eq!(state.status, ConsignmentStatus::Rejected);
    assert_eq!(w.s.balance(&state.vault), 0);
    assert_eq!(w.s.balance(&t.ata), 10_000 * USD);
    let cs = w.container_state(&c);
    assert_eq!(cs.active_count, 0);
    assert_eq!(cs.booked_cbm_milli, 0);
    assert_eq!(w.forwarder_state(&f).locked_coverage, 0);
    // Can't reject twice; an empty container can now be cancelled.
    assert_manifest_err(
        w.reject_booking_tx(&f, k),
        ManifestError::InvalidConsignmentStatus,
    );
    w.cancel_container_tx(&f, c).unwrap();
}

#[test]
fn cancel_container_blocked_by_active_booking() {
    let (mut w, f, c, t) = setup();
    w.book(&t, c);
    assert_manifest_err(
        w.cancel_container_tx(&f, c),
        ManifestError::ContainerHasActiveConsignments,
    );
}

#[test]
fn trader_refund_after_cutoff_without_receipt() {
    let (mut w, f, c, t) = setup();
    let k = w.book(&t, c);
    let kp = t.kp.insecure_clone();

    // Not before the cut-off.
    assert_manifest_err(w.refund_tx(&kp, k), ManifestError::CutoffNotReached);
    w.s.warp(10 * DAY + 1);
    // Not by someone else.
    let stranger = w.s.funded_keypair();
    assert_manifest_err(w.refund_tx(&stranger, k), ManifestError::NotTrader);

    w.refund_tx(&kp, k).unwrap();
    let state = w.consignment_state(&k);
    assert_eq!(state.status, ConsignmentStatus::Refunded);
    assert_eq!(w.s.balance(&t.ata), 10_000 * USD);
    assert_eq!(w.container_state(&c).active_count, 0);
    assert_eq!(w.forwarder_state(&f).locked_coverage, 0);
    assert_manifest_err(w.refund_tx(&kp, k), ManifestError::InvalidConsignmentStatus);
}

#[test]
fn refund_not_possible_once_goods_received() {
    let (mut w, f, c, t) = setup();
    let k = w.book(&t, c);
    w.record_receipt_tx(&f, k, 1_000, 12).unwrap();
    w.s.warp(10 * DAY + 1);
    let kp = t.kp.insecure_clone();
    assert_manifest_err(w.refund_tx(&kp, k), ManifestError::InvalidConsignmentStatus);
}

#[test]
fn trader_reject_goods_opens_dispute() {
    let (mut w, f, c, t) = setup();
    let k = w.book(&t, c);
    w.record_receipt_tx(&f, k, 1_000, 12).unwrap();
    let kp = t.kp.insecure_clone();

    assert_manifest_err(
        w.reject_goods_tx(&kp, k, 0),
        ManifestError::InvalidDisputeReason,
    );
    assert_manifest_err(
        w.reject_goods_tx(&kp, k, 7),
        ManifestError::InvalidDisputeReason,
    );
    let stranger = w.s.funded_keypair();
    assert_manifest_err(w.reject_goods_tx(&stranger, k, 1), ManifestError::NotTrader);

    w.reject_goods_tx(&kp, k, 2).unwrap();
    let state = w.consignment_state(&k);
    assert_eq!(state.status, ConsignmentStatus::Disputed);
    assert_eq!(state.prev_status, ConsignmentStatus::Received);
    assert_eq!(state.dispute_reason, 2);
    assert_eq!(w.forwarder_state(&f).stats_disputes_opened, 1);
    // Escrow stays locked in full while disputed.
    w.assert_vault_matches_state(&k);
    assert_eq!(w.s.balance(&state.vault), TOTAL_LOCKED);
}

#[test]
fn reject_goods_after_review_window_fails() {
    let (mut w, f, c, t) = setup();
    let k = w.book(&t, c);
    w.record_receipt_tx(&f, k, 1_000, 12).unwrap();
    w.s.warp(REVIEW_WINDOW + 1);
    let kp = t.kp.insecure_clone();
    assert_manifest_err(
        w.reject_goods_tx(&kp, k, 1),
        ManifestError::ReviewWindowClosed,
    );
}
