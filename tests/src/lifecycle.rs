//! Multi-trader lifecycle through the Phase 1 instructions, asserting balances and the
//! security invariants (vault == state, bond >= coverage) after every step.
//! Phase 2 extends this through loading, arrival and pickup.

use manifest::state::{ConsignmentStatus, ContainerStatus};
use solana_keypair::Keypair;
use solana_signer::Signer;

use crate::fixtures::*;
use crate::harness::*;

#[test]
fn three_traders_book_receive_and_settle() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 5_000 * USD);
    let c = w.container(&f);

    let traders: Vec<Trader> = (0..3).map(|_| w.trader(10_000 * USD)).collect();
    let mut ks = Vec::new();
    for (i, t) in traders.iter().enumerate() {
        let index = w.container_state(&c).consignment_count;
        let params = w.book_params(Keypair::new().pubkey());
        let meta = w.book_tx(t, c, params).unwrap();
        if i == 0 {
            println!(
                "book_consignment compute units: {}",
                meta.compute_units_consumed
            );
        }
        let k = consignment_pda(&c, index);
        w.assert_vault_matches_state(&k);
        w.assert_bond_covers(&f);
        ks.push(k);
    }
    let cs = w.container_state(&c);
    assert_eq!(cs.active_count, 3);
    assert_eq!(cs.booked_cbm_milli, 3 * EST_CBM);
    assert_eq!(w.forwarder_state(&f).locked_coverage, 3 * 480 * USD);

    // Goods for traders 0 and 1 arrive at the warehouse; trader 2's never do.
    w.record_receipt_tx(&f, ks[0], 1_000, 12).unwrap();
    w.record_receipt_tx(&f, ks[1], 1_250, 8).unwrap();
    for k in &ks {
        w.assert_vault_matches_state(k);
    }

    // Trader 0 approves manually; trader 1 stays silent and the crank auto-approves.
    let t0 = traders[0].kp.insecure_clone();
    w.approve_tx(&t0, ks[0]).unwrap();
    w.s.warp(REVIEW_WINDOW + 1);
    let crank = w.s.funded_keypair();
    w.auto_approve_tx(&crank, ks[1]).unwrap();

    // Cut-off passes: the crank closes bookings, trader 2 refunds themselves.
    w.s.warp(10 * DAY);
    w.close_booking_tx(&crank, &f, c).unwrap();
    let t2 = traders[2].kp.insecure_clone();
    w.refund_tx(&t2, ks[2]).unwrap();
    assert_eq!(w.s.balance(&traders[2].ata), 10_000 * USD);

    for k in &ks {
        w.assert_vault_matches_state(k);
    }
    w.assert_bond_covers(&f);

    let statuses: Vec<_> = ks.iter().map(|k| w.consignment_state(k).status).collect();
    assert_eq!(
        statuses,
        vec![
            ConsignmentStatus::Approved,
            ConsignmentStatus::Approved,
            ConsignmentStatus::Refunded
        ]
    );
    let cs = w.container_state(&c);
    assert_eq!(cs.status, ContainerStatus::Closed);
    assert_eq!(cs.active_count, 2);
    assert_eq!(cs.approved_count, 2);
    assert_eq!(cs.received_cbm_milli, 2_250);
    // Coverage stays locked for the two approved consignments until delivery (Phase 2).
    assert_eq!(w.forwarder_state(&f).locked_coverage, 2 * 480 * USD);

    // Treasury earned the fee on both approvals, nothing on the refund.
    let treasury_ata = Svm::ata(&w.treasury.pubkey(), &w.usd, &spl_token_id());
    assert_eq!(w.s.balance(&treasury_ata), 2 * 18 * USD);
}

#[test]
fn full_lifecycle_three_traders_to_completed_container() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 5_000 * USD);
    let c = w.container(&f);
    let traders: Vec<Trader> = (0..3).map(|_| w.trader(10_000 * USD)).collect();
    let ks: Vec<_> = traders.iter().map(|t| w.book(t, c)).collect();

    // Receipts: 1.000, 1.250 and 1.100 CBM measured.
    for (k, measured) in ks.iter().zip([1_000u32, 1_250, 1_100]) {
        w.record_receipt_tx(&f, *k, measured, 10).unwrap();
        w.assert_vault_matches_state(k);
    }

    // Two manual approvals, one auto-approval by the crank.
    for (t, k) in traders.iter().zip(&ks).take(2) {
        let kp = t.kp.insecure_clone();
        w.approve_tx(&kp, *k).unwrap();
    }
    w.s.warp(REVIEW_WINDOW + 1);
    let crank = w.s.funded_keypair();
    w.auto_approve_tx(&crank, ks[2]).unwrap();
    for k in &ks {
        assert_eq!(w.consignment_state(k).status, ConsignmentStatus::Approved);
        w.assert_vault_matches_state(k);
    }

    // Voyage.
    let fk = f.kp.insecure_clone();
    w.close_booking_tx(&fk, &f, c).unwrap();
    w.ship_tx(&f, c, true).unwrap();
    assert_eq!(w.container_state(&c).status, ContainerStatus::Loaded);
    w.s.warp(45 * DAY);
    w.ship_tx(&f, c, false).unwrap();
    assert_eq!(w.container_state(&c).status, ContainerStatus::Arrived);

    // Pickups.
    let freights = [380 * USD, 475 * USD, 418 * USD];
    let fwd_ata = Svm::ata(&f.kp.pubkey(), &w.usd, &spl_token_id());
    let mut paid = 0;
    for (i, (t, k)) in traders.iter().zip(&ks).enumerate() {
        let kp = t.kp.insecure_clone();
        w.confirm_pickup_tx(&kp, *k).unwrap();
        paid += freights[i];
        assert_eq!(w.s.balance(&fwd_ata), paid);
        assert_eq!(w.consignment_state(k).status, ConsignmentStatus::Delivered);
        w.assert_vault_matches_state(k);
        w.assert_bond_covers(&f);
        let expected = if i == 2 {
            ContainerStatus::Completed
        } else {
            ContainerStatus::Arrived
        };
        assert_eq!(w.container_state(&c).status, expected);
    }

    let cs = w.container_state(&c);
    assert_eq!(cs.active_count, 3);
    assert_eq!(cs.approved_count, 3);
    assert_eq!(cs.settled_count, 3);
    let fs = w.forwarder_state(&f);
    assert_eq!(fs.stats_consignments_delivered, 3);
    assert_eq!(fs.stats_on_time, 3);
    assert_eq!(fs.stats_volume, 3 * GOODS);
    assert_eq!(fs.locked_coverage, 0);
    assert_eq!(fs.bond_balance, 5_000 * USD);

    // Money conservation: each trader paid goods + fee + freight due; nothing stuck.
    for (t, freight) in traders.iter().zip(freights) {
        assert_eq!(
            w.s.balance(&t.ata),
            10_000 * USD - GOODS - 18 * USD - freight
        );
    }
    let treasury_ata = Svm::ata(&w.treasury.pubkey(), &w.usd, &spl_token_id());
    assert_eq!(w.s.balance(&treasury_ata), 3 * 18 * USD);
}
