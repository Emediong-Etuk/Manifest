//! open_container / close_booking / cancel_container.

use manifest::errors::ManifestError;
use manifest::state::ContainerStatus;

use crate::fixtures::*;
use crate::harness::*;

#[test]
fn open_container_stores_route_and_increments_counter() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 5_000 * USD);
    let c = w.container(&f);
    let state = w.container_state(&c);
    assert_eq!(state.forwarder, f.pda);
    assert_eq!(state.index, 0);
    assert_eq!(&state.code[..8], b"LAG-1014");
    assert_eq!(&state.origin, b"CNCAN");
    assert_eq!(&state.destination, b"NGAPP");
    assert_eq!(state.mint, w.usd);
    assert_eq!(state.capacity_cbm_milli, CAPACITY);
    assert_eq!(state.rate_per_cbm, RATE);
    assert_eq!(state.status, ContainerStatus::Open);
    assert_eq!(w.forwarder_state(&f).container_count, 1);

    // A second container gets index 1.
    let c2 = w.container(&f);
    assert_eq!(w.container_state(&c2).index, 1);
}

#[test]
fn open_container_rejected_when_paused() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 0);
    let admin = w.admin.insecure_clone();
    let mut params = w.default_params();
    params.paused = true;
    let usd = w.usd;
    w.update_config_as(&admin, &params, &[usd]).unwrap();
    let p = w.container_params();
    assert_manifest_err(w.open_container_tx(&f, p, usd), ManifestError::Paused);
}

#[test]
fn open_container_rejects_disallowed_mint() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 0);
    let admin = w.admin.insecure_clone();
    let other = w.s.create_mint(&admin, DECIMALS, &spl_token_id());
    let p = w.container_params();
    assert_manifest_err(
        w.open_container_tx(&f, p, other),
        ManifestError::MintNotAllowed,
    );
}

#[test]
fn open_container_validates_schedule_ports_and_sizes() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 0);
    let usd = w.usd;
    let now = w.s.now();

    let mut p = w.container_params();
    p.cutoff_ts = now - 1;
    assert_manifest_err(
        w.open_container_tx(&f, p, usd),
        ManifestError::InvalidSchedule,
    );

    let mut p = w.container_params();
    p.eta_ts = p.cutoff_ts;
    assert_manifest_err(
        w.open_container_tx(&f, p, usd),
        ManifestError::InvalidSchedule,
    );

    let mut p = w.container_params();
    p.destination = *b"CNCAN";
    assert_manifest_err(w.open_container_tx(&f, p, usd), ManifestError::SamePorts);

    let mut p = w.container_params();
    p.origin = *b"cncan";
    assert_manifest_err(
        w.open_container_tx(&f, p, usd),
        ManifestError::InvalidLocode,
    );

    let mut p = w.container_params();
    p.capacity_cbm_milli = 0;
    assert_manifest_err(w.open_container_tx(&f, p, usd), ManifestError::ZeroCapacity);

    let mut p = w.container_params();
    p.rate_per_cbm = 0;
    assert_manifest_err(w.open_container_tx(&f, p, usd), ManifestError::ZeroRate);

    let mut p = w.container_params();
    p.code = [0; 12];
    assert_manifest_err(
        w.open_container_tx(&f, p, usd),
        ManifestError::InvalidString,
    );
}

#[test]
fn open_container_rejects_non_forwarder() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 0);
    let stranger = w.s.funded_keypair();
    let fake = Fwd {
        kp: stranger,
        pda: f.pda,
        vault: f.vault,
        ata: f.ata,
    };
    let p = w.container_params();
    let usd = w.usd;
    assert!(w.open_container_tx(&fake, p, usd).is_err());
}

#[test]
fn forwarder_can_close_booking_before_cutoff() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 0);
    let c = w.container(&f);
    let kp = f.kp.insecure_clone();
    w.close_booking_tx(&kp, &f, c).unwrap();
    assert_eq!(w.container_state(&c).status, ContainerStatus::Closed);
    // Closing twice fails.
    assert_manifest_err(
        w.close_booking_tx(&kp, &f, c),
        ManifestError::InvalidContainerStatus,
    );
}

#[test]
fn anyone_can_close_booking_after_cutoff_only() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 0);
    let c = w.container(&f);
    let crank = w.s.funded_keypair();
    assert_manifest_err(
        w.close_booking_tx(&crank, &f, c),
        ManifestError::CutoffNotReached,
    );
    w.s.warp(10 * DAY);
    w.close_booking_tx(&crank, &f, c).unwrap();
    assert_eq!(w.container_state(&c).status, ContainerStatus::Closed);
}

#[test]
fn close_booking_rejects_mismatched_forwarder() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 0);
    let g = w.forwarder("Harbour Link", 0);
    let c = w.container(&f);
    let g_kp = g.kp.insecure_clone();
    // g signs and passes its own forwarder account, but the container belongs to f.
    assert_manifest_err(
        w.close_booking_tx(&g_kp, &g, c),
        ManifestError::AccountMismatch,
    );
}

#[test]
fn cancel_container_without_bookings() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 0);
    let c = w.container(&f);
    w.cancel_container_tx(&f, c).unwrap();
    assert_eq!(w.container_state(&c).status, ContainerStatus::Cancelled);
    assert_manifest_err(
        w.cancel_container_tx(&f, c),
        ManifestError::InvalidContainerStatus,
    );
}

#[test]
fn closed_container_can_still_be_cancelled_when_empty() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 0);
    let c = w.container(&f);
    let kp = f.kp.insecure_clone();
    w.close_booking_tx(&kp, &f, c).unwrap();
    w.cancel_container_tx(&f, c).unwrap();
    assert_eq!(w.container_state(&c).status, ContainerStatus::Cancelled);
}
