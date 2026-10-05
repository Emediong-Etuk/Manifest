//! confirm_pickup / claim_freight_after_grace / Cargo Ticket transfer.

use anchor_lang::prelude::Pubkey;
use manifest::errors::ManifestError;
use manifest::state::{ConsignmentStatus, ContainerStatus};
use solana_signer::Signer;

use crate::fixtures::*;
use crate::harness::*;

struct Arrived {
    w: World,
    f: Fwd,
    c: Pubkey,
    t: Trader,
    k: Pubkey,
}

/// One consignment approved at `measured` milli-CBM, container closed, loaded, arrived.
fn arrived(measured: u32) -> Arrived {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 5_000 * USD);
    let c = w.container(&f);
    let t = w.trader(10_000 * USD);
    let k = w.approved(&f, c, &t, measured);
    w.sail(&f, c);
    Arrived { w, f, c, t, k }
}

#[test]
fn confirm_pickup_pays_forwarder_burns_ticket_and_updates_stats() {
    let Arrived { mut w, f, c, t, k } = arrived(1_000);
    let ticket = w.consignment_state(&k).cargo_ticket_mint;
    let holder_ticket = Svm::ata(&t.kp.pubkey(), &ticket, &token_2022_id());
    let kp = t.kp.insecure_clone();

    let meta = w.confirm_pickup_tx(&kp, k).unwrap();
    println!(
        "confirm_pickup compute units: {}",
        meta.compute_units_consumed
    );

    let fwd_ata = Svm::ata(&f.kp.pubkey(), &w.usd, &spl_token_id());
    assert_eq!(w.s.balance(&fwd_ata), 380 * USD);
    let state = w.consignment_state(&k);
    assert_eq!(state.status, ConsignmentStatus::Delivered);
    assert_eq!(state.settled_at, w.s.now());
    assert_eq!(w.s.balance(&state.vault), 0);
    w.assert_vault_matches_state(&k);

    // Ticket burned (supply 0) and the holder's ticket account closed.
    assert!(!w.s.exists(&holder_ticket));
    let mint = w.s.svm.get_account(&ticket).unwrap();
    assert_eq!(u64::from_le_bytes(mint.data[36..44].try_into().unwrap()), 0);

    let fs = w.forwarder_state(&f);
    assert_eq!(fs.stats_consignments_delivered, 1);
    assert_eq!(fs.stats_on_time, 1);
    assert_eq!(fs.stats_volume, GOODS);
    assert_eq!(fs.locked_coverage, 0);
    w.assert_bond_covers(&f);

    let cs = w.container_state(&c);
    assert_eq!(cs.settled_count, 1);
    assert_eq!(cs.status, ContainerStatus::Completed);

    // Double pickup fails.
    assert!(w.confirm_pickup_tx(&kp, k).is_err());
}

#[test]
fn pickup_before_arrival_fails() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 5_000 * USD);
    let c = w.container(&f);
    let t = w.trader(10_000 * USD);
    let k = w.approved(&f, c, &t, 1_000);
    let kp = t.kp.insecure_clone();
    assert_manifest_err(
        w.confirm_pickup_tx(&kp, k),
        ManifestError::InvalidContainerStatus,
    );
}

#[test]
fn pickup_by_non_holder_fails() {
    let Arrived { mut w, k, .. } = arrived(1_000);
    let stranger = w.s.funded_keypair();
    // The stranger has no ticket account for this mint.
    assert!(w.confirm_pickup_tx(&stranger, k).is_err());
}

#[test]
fn pickup_with_insufficient_freight_fails_until_topped_up() {
    let Arrived { mut w, t, k, .. } = arrived(1_500);
    let kp = t.kp.insecure_clone();
    assert_manifest_err(w.confirm_pickup_tx(&kp, k), ManifestError::FreightShort);
    w.top_up_tx(&kp, t.ata, k, 47_500_000).unwrap();
    w.confirm_pickup_tx(&kp, k).unwrap();
    assert_eq!(w.consignment_state(&k).status, ConsignmentStatus::Delivered);
}

#[test]
fn late_arrival_is_not_counted_on_time() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 5_000 * USD);
    let c = w.container(&f);
    let t = w.trader(10_000 * USD);
    let k = w.approved(&f, c, &t, 1_000);
    let kp = f.kp.insecure_clone();
    w.close_booking_tx(&kp, &f, c).unwrap();
    w.ship_tx(&f, c, true).unwrap();
    // ETA is +50 days; on-time grace is 7 days. Arrive at +60 days.
    w.s.warp(60 * DAY);
    w.ship_tx(&f, c, false).unwrap();
    let tk = t.kp.insecure_clone();
    w.confirm_pickup_tx(&tk, k).unwrap();
    let fs = w.forwarder_state(&f);
    assert_eq!(fs.stats_consignments_delivered, 1);
    assert_eq!(fs.stats_on_time, 0);
}

#[test]
fn cargo_ticket_transfer_moves_pickup_rights_to_buyer() {
    let Arrived { mut w, t, k, .. } = arrived(1_000);
    let seller = t.kp.insecure_clone();
    let buyer = w.s.funded_keypair();
    w.transfer_ticket(&seller, &buyer.pubkey(), k).unwrap();

    // The original trader can no longer pick up or dispute.
    assert!(w.confirm_pickup_tx(&seller, k).is_err());
    assert!(w.open_dispute_tx(&seller, k, 3).is_err());

    w.confirm_pickup_tx(&buyer, k).unwrap();
    assert_eq!(w.consignment_state(&k).status, ConsignmentStatus::Delivered);
}

#[test]
fn ticket_can_be_resold_before_arrival() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 5_000 * USD);
    let c = w.container(&f);
    let t = w.trader(10_000 * USD);
    let k = w.approved(&f, c, &t, 1_000);
    let seller = t.kp.insecure_clone();
    let buyer = w.s.funded_keypair();
    // "Selling goods on the water": transfer while the container is still open.
    w.transfer_ticket(&seller, &buyer.pubkey(), k).unwrap();
    w.sail(&f, c);
    w.confirm_pickup_tx(&buyer, k).unwrap();
}

#[test]
fn forwarder_claims_freight_after_grace_and_ticket_burns() {
    let Arrived { mut w, f, c, t, k } = arrived(1_000);
    let holder = t.kp.pubkey();

    assert_manifest_err(
        w.claim_freight_tx(&f, k, holder),
        ManifestError::PickupGraceNotOver,
    );
    w.s.warp(300 + 1);
    let meta = w.claim_freight_tx(&f, k, holder).unwrap();
    println!(
        "claim_freight_after_grace compute units: {}",
        meta.compute_units_consumed
    );

    let fwd_ata = Svm::ata(&f.kp.pubkey(), &w.usd, &spl_token_id());
    assert_eq!(w.s.balance(&fwd_ata), 380 * USD);
    let state = w.consignment_state(&k);
    assert_eq!(state.status, ConsignmentStatus::Settled);
    let holder_ticket = Svm::ata(&holder, &state.cargo_ticket_mint, &token_2022_id());
    assert_eq!(
        w.s.balance(&holder_ticket),
        0,
        "burned by the permanent delegate"
    );
    assert_eq!(w.container_state(&c).status, ContainerStatus::Completed);
    assert_eq!(w.forwarder_state(&f).locked_coverage, 0);
    // A claim is not a confirmed delivery.
    assert_eq!(w.forwarder_state(&f).stats_consignments_delivered, 0);
}

#[test]
fn claim_freight_blocked_while_disputed() {
    let Arrived { mut w, f, t, k, .. } = arrived(1_000);
    let kp = t.kp.insecure_clone();
    w.open_dispute_tx(&kp, k, 3).unwrap();
    w.s.warp(300 + 1);
    assert_manifest_err(
        w.claim_freight_tx(&f, k, t.kp.pubkey()),
        ManifestError::InvalidConsignmentStatus,
    );
}

#[test]
fn claim_freight_rejects_wrong_holder_account() {
    let Arrived { mut w, f, k, .. } = arrived(1_000);
    w.s.warp(300 + 1);
    // Someone who doesn't hold the ticket: their ticket account doesn't exist.
    let stranger = w.s.funded_keypair();
    assert!(w.claim_freight_tx(&f, k, stranger.pubkey()).is_err());
}
