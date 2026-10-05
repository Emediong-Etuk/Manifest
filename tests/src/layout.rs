//! Locks the byte offsets the TypeScript SDK uses for getProgramAccounts memcmp filters
//! (packages/sdk/test/core.test.ts computes the same numbers from the IDL).

use anchor_lang::Space;
use manifest::state::{Consignment, Container};
use solana_signer::Signer;

use crate::fixtures::*;
use crate::harness::*;

#[test]
fn account_offsets_match_sdk_memcmp_filters() {
    let mut w = World::new();
    let f = w.forwarder("Eastline Cargo", 5_000 * USD);
    let c = w.container(&f);
    let t = w.trader(10_000 * USD);
    let k = w.approved(&f, c, &t, 1_000);

    let data = w.s.svm.get_account(&k).unwrap().data;
    assert_eq!(data.len(), 8 + Consignment::INIT_SPACE);
    assert_eq!(data.len(), 394);
    assert_eq!(&data[11..43], c.as_ref(), "Consignment.container @ 11");
    assert_eq!(
        &data[45..77],
        t.kp.pubkey().as_ref(),
        "Consignment.trader @ 45"
    );
    assert_eq!(data[319], 2, "Consignment.status @ 319 (Approved = 2)");

    let data = w.s.svm.get_account(&c).unwrap().data;
    assert_eq!(data.len(), 8 + Container::INIT_SPACE);
    assert_eq!(&data[10..42], f.pda.as_ref(), "Container.forwarder @ 10");
    assert_eq!(data[137], 0, "Container.status @ 137 (Open = 0)");
}
