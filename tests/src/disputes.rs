//! open_dispute and the arbitrator's resolutions.

use anchor_lang::prelude::Pubkey;
use manifest::errors::ManifestError;
use manifest::state::{ConsignmentStatus, ContainerStatus};
use solana_signer::Signer;

use crate::fixtures::*;
use crate::harness::*;

const TOTAL_LOCKED: u64 = 2_940_500_000;

struct Setup {
    w: World,
    f: Fwd,
    c: Pubkey,
    t: Trader,
}

fn setup() -> Setup {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 5_000 * USD);
    let c = w.container(&f);
    let t = w.trader(10_000 * USD);
    Setup { w, f, c, t }
}

/// Booked, received and rejected by the trader (pre-approval dispute).
fn pre_approval_dispute(s: &mut Setup) -> Pubkey {
    let k = s.w.book(&s.t, s.c);
    s.w.record_receipt_tx(&s.f, k, 1_000, 12).unwrap();
    let kp = s.t.kp.insecure_clone();
    s.w.reject_goods_tx(&kp, k, 1).unwrap();
    k
}

#[test]
fn resolve_refund_escrow_returns_everything_to_trader() {
    let mut s = setup();
    let k = pre_approval_dispute(&mut s);
    let arb = s.w.arbitrator.insecure_clone();
    s.w.resolve_refund_tx(&arb, k).unwrap();

    let state = s.w.consignment_state(&k);
    assert_eq!(state.status, ConsignmentStatus::Refunded);
    assert_eq!(s.w.s.balance(&s.t.ata), 10_000 * USD);
    assert_eq!(s.w.s.balance(&state.vault), 0);
    let cs = s.w.container_state(&s.c);
    assert_eq!(cs.active_count, 0);
    assert_eq!(cs.booked_cbm_milli, 0);
    assert_eq!(cs.received_cbm_milli, 0);
    assert_eq!(s.w.forwarder_state(&s.f).locked_coverage, 0);
}

#[test]
fn resolve_force_approve_runs_settlement() {
    let mut s = setup();
    let k = pre_approval_dispute(&mut s);
    let arb = s.w.arbitrator.insecure_clone();
    let payee = s.w.consignment_state(&k).payee;
    s.w.resolve_force_approve_tx(&arb, k).unwrap();

    let state = s.w.consignment_state(&k);
    assert_eq!(state.status, ConsignmentStatus::Approved);
    assert_eq!(
        s.w.s.balance(&Svm::ata(&payee, &s.w.usd, &spl_token_id())),
        GOODS
    );
    let ticket_ata = Svm::ata(&s.t.kp.pubkey(), &state.cargo_ticket_mint, &token_2022_id());
    assert_eq!(s.w.s.balance(&ticket_ata), 1, "ticket goes to the trader");
    s.w.assert_vault_matches_state(&k);
}

#[test]
fn force_approve_requires_arbitrator() {
    let mut s = setup();
    let k = pre_approval_dispute(&mut s);
    let kp = s.t.kp.insecure_clone();
    assert_manifest_err(
        s.w.resolve_force_approve_tx(&kp, k),
        ManifestError::NotArbitrator,
    );
}

#[test]
fn dismiss_returns_to_previous_status() {
    let mut s = setup();
    let k = pre_approval_dispute(&mut s);
    let arb = s.w.arbitrator.insecure_clone();
    s.w.resolve_dismiss_tx(&arb, k).unwrap();
    assert_eq!(
        s.w.consignment_state(&k).status,
        ConsignmentStatus::Received
    );
    assert_eq!(
        s.w.s.balance(&s.w.consignment_state(&k).vault),
        TOTAL_LOCKED
    );
    // Dismissing a non-disputed consignment fails.
    assert_manifest_err(
        s.w.resolve_dismiss_tx(&arb, k),
        ManifestError::InvalidConsignmentStatus,
    );

    // Post-approval dismissal (in a second container) returns to Approved.
    let c2 = s.w.container(&s.f);
    let k2 = s.w.approved(&s.f, c2, &s.t, 1_000);
    s.w.sail(&s.f, c2);
    let kp = s.t.kp.insecure_clone();
    s.w.open_dispute_tx(&kp, k2, 4).unwrap();
    s.w.resolve_dismiss_tx(&arb, k2).unwrap();
    assert_eq!(
        s.w.consignment_state(&k2).status,
        ConsignmentStatus::Approved
    );
}

#[test]
fn post_arrival_dispute_resolved_with_slash() {
    let mut s = setup();
    let k = s.w.approved(&s.f, s.c, &s.t, 1_000);
    s.w.sail(&s.f, s.c);
    let kp = s.t.kp.insecure_clone();
    s.w.open_dispute_tx(&kp, k, 3).unwrap();
    let state = s.w.consignment_state(&k);
    assert_eq!(state.status, ConsignmentStatus::Disputed);
    assert_eq!(state.prev_status, ConsignmentStatus::Approved);
    assert_eq!(state.dispute_reason, 3);
    assert_eq!(s.w.forwarder_state(&s.f).stats_disputes_opened, 1);

    let holder = s.t.kp.pubkey();
    let before = s.w.s.balance(&s.t.ata);
    let arb = s.w.arbitrator.insecure_clone();
    let meta = s.w.resolve_slash_tx(&arb, k, holder, 500 * USD).unwrap();
    println!(
        "resolve_slash_bond compute units: {}",
        meta.compute_units_consumed
    );

    // Holder gets $500 from the bond plus the $380 freight escrow back.
    assert_eq!(s.w.s.balance(&s.t.ata), before + 500 * USD + 380 * USD);
    let state = s.w.consignment_state(&k);
    assert_eq!(state.status, ConsignmentStatus::Compensated);
    assert_eq!(s.w.s.balance(&state.vault), 0);
    let ticket_ata = Svm::ata(&holder, &state.cargo_ticket_mint, &token_2022_id());
    assert_eq!(s.w.s.balance(&ticket_ata), 0, "ticket burned");

    let fs = s.w.forwarder_state(&s.f);
    assert_eq!(fs.bond_balance, 4_500 * USD);
    assert_eq!(fs.stats_disputes_lost, 1);
    assert_eq!(fs.stats_slashed_total, 500 * USD);
    assert_eq!(fs.locked_coverage, 0);
    s.w.assert_bond_covers(&s.f);
    assert_eq!(s.w.container_state(&s.c).status, ContainerStatus::Completed);
}

#[test]
fn slash_is_capped_at_goods_value_and_bond_balance() {
    let mut w = World::new();
    let f = w.forwarder("Thin Bond Ltd", 600 * USD);
    let c = w.container(&f);
    let t = w.trader(10_000 * USD);
    let k = w.approved(&f, c, &t, 1_000);
    w.sail(&f, c);
    let kp = t.kp.insecure_clone();
    w.open_dispute_tx(&kp, k, 3).unwrap();
    let arb = w.arbitrator.insecure_clone();
    // Asked for $10,000: goods are $2,400 but the bond only holds $600.
    w.resolve_slash_tx(&arb, k, t.kp.pubkey(), 10_000 * USD)
        .unwrap();
    let fs = w.forwarder_state(&f);
    assert_eq!(fs.bond_balance, 0);
    assert_eq!(fs.stats_slashed_total, 600 * USD);
}

#[test]
fn overdue_dispute_when_container_never_arrives() {
    let mut s = setup();
    let k = s.w.approved(&s.f, s.c, &s.t, 1_000);
    let kp = s.t.kp.insecure_clone();
    s.w.close_booking_tx(&s.f.kp.insecure_clone(), &s.f, s.c)
        .unwrap();
    s.w.ship_tx(&s.f, s.c, true).unwrap();

    // ETA is +50 days and overdue grace is 600 s: too early at +50 days.
    s.w.s.warp(50 * DAY);
    assert_manifest_err(
        s.w.open_dispute_tx(&kp, k, 5),
        ManifestError::DisputeNotAllowed,
    );
    s.w.s.warp(601);
    s.w.open_dispute_tx(&kp, k, 5).unwrap();

    let arb = s.w.arbitrator.insecure_clone();
    s.w.resolve_slash_tx(&arb, k, s.t.kp.pubkey(), GOODS)
        .unwrap();
    assert_eq!(
        s.w.consignment_state(&k).status,
        ConsignmentStatus::Compensated
    );
    // The container never arrived; if it ever does, it completes immediately.
    s.w.ship_tx(&s.f, s.c, false).unwrap();
    assert_eq!(s.w.container_state(&s.c).status, ContainerStatus::Completed);
}

#[test]
fn dispute_window_closes_after_arrival() {
    let mut s = setup();
    let k = s.w.approved(&s.f, s.c, &s.t, 1_000);
    s.w.sail(&s.f, s.c);
    s.w.s.warp(600 + 1);
    let kp = s.t.kp.insecure_clone();
    assert_manifest_err(
        s.w.open_dispute_tx(&kp, k, 3),
        ManifestError::DisputeNotAllowed,
    );
}

#[test]
fn open_dispute_validates_holder_status_and_reason() {
    let mut s = setup();
    let k = s.w.approved(&s.f, s.c, &s.t, 1_000);
    s.w.sail(&s.f, s.c);
    let kp = s.t.kp.insecure_clone();
    assert_manifest_err(
        s.w.open_dispute_tx(&kp, k, 0),
        ManifestError::InvalidDisputeReason,
    );
    let stranger = s.w.s.funded_keypair();
    assert!(s.w.open_dispute_tx(&stranger, k, 3).is_err());
    s.w.open_dispute_tx(&kp, k, 3).unwrap();
    assert_manifest_err(
        s.w.open_dispute_tx(&kp, k, 3),
        ManifestError::InvalidConsignmentStatus,
    );
}

#[test]
fn resolutions_require_the_arbitrator() {
    let mut s = setup();
    let k = pre_approval_dispute(&mut s);
    let stranger = s.w.s.funded_keypair();
    assert_manifest_err(
        s.w.resolve_refund_tx(&stranger, k),
        ManifestError::NotArbitrator,
    );
    assert_manifest_err(
        s.w.resolve_dismiss_tx(&stranger, k),
        ManifestError::NotArbitrator,
    );
    let holder = s.t.kp.pubkey();
    assert!(s.w.resolve_slash_tx(&stranger, k, holder, USD).is_err());
}

#[test]
fn refund_escrow_not_allowed_after_approval() {
    let mut s = setup();
    let k = s.w.approved(&s.f, s.c, &s.t, 1_000);
    s.w.sail(&s.f, s.c);
    let kp = s.t.kp.insecure_clone();
    s.w.open_dispute_tx(&kp, k, 3).unwrap();
    let arb = s.w.arbitrator.insecure_clone();
    assert_manifest_err(
        s.w.resolve_refund_tx(&arb, k),
        ManifestError::InvalidResolution,
    );
    // Force-approving again can't even re-create the existing Cargo Ticket mint.
    assert!(s.w.resolve_force_approve_tx(&arb, k).is_err());
    assert_eq!(
        s.w.consignment_state(&k).status,
        ConsignmentStatus::Disputed
    );
}

#[test]
fn slash_not_allowed_before_approval() {
    let mut s = setup();
    let k = pre_approval_dispute(&mut s);
    let arb = s.w.arbitrator.insecure_clone();
    // There is no ticket yet, so the holder account can't be valid either.
    assert!(s.w.resolve_slash_tx(&arb, k, s.t.kp.pubkey(), USD).is_err());
}
