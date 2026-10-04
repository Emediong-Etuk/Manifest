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
