//! top_up_freight / mark_loaded / mark_arrived.

use manifest::errors::ManifestError;
use manifest::state::ContainerStatus;

use crate::fixtures::*;
use crate::harness::*;

#[test]
fn top_up_covers_freight_shortfall_exactly() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 5_000 * USD);
    let c = w.container(&f);
    let t = w.trader(10_000 * USD);
    // Measured 1.5 CBM: due $570, escrowed $522.50, short $47.50.
    let k = w.approved(&f, c, &t, 1_500);
    let kp = t.kp.insecure_clone();

    assert_manifest_err(w.top_up_tx(&kp, t.ata, k, 0), ManifestError::ZeroAmount);
    assert_manifest_err(
        w.top_up_tx(&kp, t.ata, k, 47_500_001),
        ManifestError::TopUpTooLarge,
    );
    w.top_up_tx(&kp, t.ata, k, 40 * USD).unwrap();
    w.top_up_tx(&kp, t.ata, k, 7_500_000).unwrap();
    let state = w.consignment_state(&k);
    assert_eq!(state.freight_escrowed, state.freight_due);
    w.assert_vault_matches_state(&k);
    // Fully funded: any further top-up is too large.
    assert_manifest_err(w.top_up_tx(&kp, t.ata, k, 1), ManifestError::TopUpTooLarge);
}

#[test]
fn top_up_only_after_approval() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 5_000 * USD);
    let c = w.container(&f);
    let t = w.trader(10_000 * USD);
    let k = w.book(&t, c);
    let kp = t.kp.insecure_clone();
    assert_manifest_err(
        w.top_up_tx(&kp, t.ata, k, USD),
        ManifestError::InvalidConsignmentStatus,
    );
}

#[test]
fn load_and_arrive_record_voyage() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 5_000 * USD);
    let c = w.container(&f);
    let t = w.trader(10_000 * USD);
    w.approved(&f, c, &t, 1_000);
    let kp = f.kp.insecure_clone();

    // Must close bookings first.
    assert_manifest_err(
        w.ship_tx(&f, c, true),
        ManifestError::InvalidContainerStatus,
    );
    w.close_booking_tx(&kp, &f, c).unwrap();
    // Can't arrive before loading.
    assert_manifest_err(
        w.ship_tx(&f, c, false),
        ManifestError::InvalidContainerStatus,
    );

    w.ship_tx(&f, c, true).unwrap();
    let cs = w.container_state(&c);
    assert_eq!(cs.status, ContainerStatus::Loaded);
    assert_eq!(cs.container_number, CONTAINER_NUMBER);
    assert_eq!(cs.bl_hash, BL_HASH);
    assert_eq!(cs.loaded_ts, w.s.now());

    w.s.warp(40 * DAY);
    w.ship_tx(&f, c, false).unwrap();
    let cs = w.container_state(&c);
    assert_eq!(cs.status, ContainerStatus::Arrived);
    assert_eq!(cs.arrived_ts, w.s.now());
    assert_manifest_err(
        w.ship_tx(&f, c, false),
        ManifestError::InvalidContainerStatus,
    );
}

#[test]
fn mark_loaded_requires_every_consignment_approved() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 5_000 * USD);
    let c = w.container(&f);
    let kp = f.kp.insecure_clone();

    // Empty container can't be loaded.
    w.close_booking_tx(&kp, &f, c).unwrap();
    assert_manifest_err(
        w.ship_tx(&f, c, true),
        ManifestError::ConsignmentsNotApproved,
    );

    let c2 = w.container(&f);
    let t = w.trader(10_000 * USD);
    w.approved(&f, c2, &t, 1_000);
    let pending = w.book(&t, c2); // booked, not yet received
    w.close_booking_tx(&kp, &f, c2).unwrap();
    assert_manifest_err(
        w.ship_tx(&f, c2, true),
        ManifestError::ConsignmentsNotApproved,
    );

    // Once the pending booking is rejected, loading works.
    w.reject_booking_tx(&f, pending).unwrap();
    w.ship_tx(&f, c2, true).unwrap();
}

#[test]
fn mark_loaded_validates_iso6346_and_bill_of_lading() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 5_000 * USD);
    let c = w.container(&f);
    let t = w.trader(10_000 * USD);
    w.approved(&f, c, &t, 1_000);
    let kp = f.kp.insecure_clone();
    w.close_booking_tx(&kp, &f, c).unwrap();

    assert_manifest_err(
        w.mark_loaded_with(&f, c, *b"CSQU3054384", BL_HASH),
        ManifestError::InvalidContainerNumber,
    );
    assert_manifest_err(
        w.mark_loaded_with(&f, c, *b"CSQX3054383", BL_HASH),
        ManifestError::InvalidContainerNumber,
    );
    assert_manifest_err(
        w.mark_loaded_with(&f, c, CONTAINER_NUMBER, [0; 32]),
        ManifestError::MissingBillOfLading,
    );
    w.mark_loaded_with(&f, c, CONTAINER_NUMBER, BL_HASH)
        .unwrap();
}

#[test]
fn shipping_rejects_other_forwarders() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 5_000 * USD);
    let g = w.forwarder("Harbour Link", 0);
    let c = w.container(&f);
    let t = w.trader(10_000 * USD);
    w.approved(&f, c, &t, 1_000);
    let kp = f.kp.insecure_clone();
    w.close_booking_tx(&kp, &f, c).unwrap();
    assert_manifest_err(w.ship_tx(&g, c, true), ManifestError::AccountMismatch);
}
