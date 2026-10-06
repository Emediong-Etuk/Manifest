/**
 * Seeds the demo world (MANIFEST_BUILD_PROMPT.md section 10) with real transactions:
 *  - Eastline Cargo: $5,000 bond, 2 completed containers with 6 on-time deliveries, and the
 *    open container LAG-1014 (CNCAN -> NGAPP) holding 3 shipments at different stages;
 *  - LAG-0930 (Eastline) has arrived: one shipment ready for pickup, one whose Cargo Ticket
 *    was sold to a second wallet, and one disputed for missing cartons;
 *  - Harbour Link Logistics: a new forwarder ($1,500 bond) with LAG-2207 (CNYIW -> NGTIN).
 * Evidence goes through the app's real /api/evidence, so the app must be running.
 * Idempotent: a container that already exists (by forwarder + code) is skipped.
 *
 *   pnpm --filter @manifest/scripts seed-demo
 */
import {
  type ConsignmentAccount,
  explorerUrl,
  forwarderPda,
  getConsignment,
  ix,
  listConsignments,
} from "@manifest/sdk";
import type { Keypair, PublicKey } from "@solana/web3.js";

import { chain, send } from "./lib/chain.js";
import { loadEnv } from "./lib/env.js";
import {
  appUrl,
  approve,
  book,
  cast,
  DAY,
  demoMint,
  ensureDollars,
  ensureSol,
  ev,
  findContainer,
  mintAuthority,
  openContainer,
  stagedShipments,
  USD,
  voyage,
} from "./lib/demo.js";

loadEnv();
const c = chain();
const p = c.program;
const who = cast();
const mint = await demoMint(c);
const authority = await mintAuthority(c, mint);

console.log(`Seeding demo world on ${c.cluster} (app: ${appUrl()})\n`);

// Wallets.
for (const f of [who.eastline, who.harbour]) await ensureSol(c, f.publicKey, 0.3);
for (const t of [who.ada, who.bayo, who.chika]) await ensureSol(c, t.publicKey, 0.3);
await ensureSol(c, who.buyer.publicKey, 0.1);
await ensureDollars(c, mint, authority, who.eastline.publicKey, 5_000n);
await ensureDollars(c, mint, authority, who.harbour.publicKey, 1_500n);
for (const t of [who.ada, who.bayo, who.chika]) {
  await ensureDollars(c, mint, authority, t.publicKey, 25_000n);
}

async function ensureForwarder(kp: Keypair, name: string, bond: bigint): Promise<PublicKey> {
  const pda = forwarderPda(kp.publicKey, p.programId);
  let f = await p.account.forwarder.fetchNullable(pda);
  if (!f) {
    await send(
      c,
      `register_forwarder "${name}"`,
      await ix.registerForwarder(p, { authority: kp.publicKey, name, bondMint: mint }),
      [kp],
    );
    f = await p.account.forwarder.fetch(pda);
  }
  const have = BigInt(f.bondBalance.toString());
  if (have < bond * USD) {
    await send(
      c,
      `deposit_bond ${name}`,
      await ix.depositBond(p, { authority: kp.publicKey, amount: bond * USD - have }),
      [kp],
    );
  }
  return pda;
}

// --- Eastline Cargo -------------------------------------------------------------------
const eastline = await ensureForwarder(who.eastline, "Eastline Cargo", 5_000n);

// History: two completed containers, three on-time deliveries each.
for (const [code, serial, items] of [
  [
    "LAG-0801",
    412_001,
    ["Phone accessories, 10 cartons", "Wigs, 4 cartons", "Power banks, 6 cartons"],
  ],
  ["LAG-0815", 412_077, ["Sneakers, 9 cartons", "Kitchenware, 7 cartons", "LED bulbs, 5 cartons"]],
] as const) {
  const existing = await findContainer(c, eastline, code);
  if (existing && "completed" in existing.account.status) {
    console.log(`${code} exists, skipping`);
    continue;
  }
  if (existing) {
    // An earlier run stopped part-way (e.g. public RPC rate limits): finish the voyage and
    // the pickups. History shipments are booked, approved and collected by their trader.
    console.log(`${code} is unfinished, resuming`);
    await voyage(c, who.eastline, existing.address, code, serial);
    const traders = [who.ada, who.bayo, who.chika];
    for (const s of await listConsignments(p, { container: existing.address })) {
      if (!("approved" in s.account.status)) continue;
      const trader = traders.find((t) => t.publicKey.equals(s.account.trader));
      if (!trader) continue;
      await send(
        c,
        "confirm_pickup",
        await ix.confirmPickup(p, { holder: trader.publicKey, consignment: s.address }),
        [trader],
      );
    }
    continue;
  }
  const k = await openContainer(
    c,
    mint,
    who.eastline,
    code,
    ["CNCAN", "NGAPP"],
    380n,
    DAY,
    40 * DAY,
  );
  const traders = [who.ada, who.bayo, who.chika];
  const shipments: [Keypair, PublicKey][] = [];
  for (const [i, description] of items.entries()) {
    const trader = traders[i] as Keypair;
    const s = await book(c, who.eastline, k, {
      trader,
      goods: 1_500n + BigInt(i) * 400n,
      estCbmMilli: 900 + i * 150,
      payee: who.supplierA,
      description,
      evidence: ev(5 + i, 850 + i * 150, description.split(",")[0] as string, 100 * (i + 1), [
        "cartons-stack.jpg",
        "warehouse-label.jpg",
      ]),
    });
    await approve(c, trader, s);
    shipments.push([trader, s]);
  }
  await voyage(c, who.eastline, k, code, serial);
  for (const [trader, s] of shipments) {
    await send(
      c,
      "confirm_pickup",
      await ix.confirmPickup(p, { holder: trader.publicKey, consignment: s }),
      [trader],
    );
  }
}

// LAG-1014: open, 3 shipments at different stages.
let lag1014 = (await findContainer(c, eastline, "LAG-1014"))?.address ?? null;
if (lag1014) {
  // Stage the three shipments unless an earlier run already did (it may have stopped
  // right after opening the container). Other people's bookings don't count.
  const staged = (await listConsignments(p, { container: lag1014 })).some((s) =>
    [who.ada, who.bayo, who.chika].some((t) => t.publicKey.equals(s.account.trader)),
  );
  if (staged) console.log("LAG-1014 exists, skipping");
  else await stagedShipments(c, who, lag1014);
} else {
  lag1014 = await openContainer(
    c,
    mint,
    who.eastline,
    "LAG-1014",
    ["CNCAN", "NGAPP"],
    380n,
    10 * DAY,
    50 * DAY,
  );
  await stagedShipments(c, who, lag1014);
}

// LAG-0930: arrived; pickup-ready, resold ticket, and a dispute.
let disputed: PublicKey | null = null;
let resold: PublicKey | null = null;
if (await findContainer(c, eastline, "LAG-0930")) {
  console.log("LAG-0930 exists, skipping");
} else {
  const k = await openContainer(
    c,
    mint,
    who.eastline,
    "LAG-0930",
    ["CNCAN", "NGAPP"],
    380n,
    DAY,
    30 * DAY,
  );
  const hair = await book(c, who.eastline, k, {
    trader: who.ada,
    goods: 2_000n,
    estCbmMilli: 600,
    payee: who.supplierA,
    description: "Hair extensions, 6 cartons",
    evidence: ev(6, 560, "Hair extensions", 300, ["cartons-stack.jpg", "warehouse-label.jpg"]),
  });
  resold = await book(c, who.eastline, k, {
    trader: who.bayo,
    goods: 2_600n,
    estCbmMilli: 1_400,
    payee: who.supplierA,
    description: "Kitchen blenders, 10 cartons",
    evidence: ev(10, 1_350, "Kitchen blenders", 120, ["pallet-wrapped.jpg", "carton-measure.jpg"]),
  });
  disputed = await book(c, who.eastline, k, {
    trader: who.chika,
    goods: 2_500n,
    estCbmMilli: 1_600,
    payee: who.supplierB,
    description: "Ladies' shoes, 15 cartons",
    evidence: ev(15, 1_550, "Ladies' shoes", 450, [
      "cartons-stack.jpg",
      "carton-measure.jpg",
      "warehouse-label.jpg",
    ]),
  });
  for (const [t, s] of [
    [who.ada, hair],
    [who.bayo, resold],
    [who.chika, disputed],
  ] as const)
    await approve(c, t, s);
  await voyage(c, who.eastline, k, "LAG-0930", 412_130);
  await send(
    c,
    "transfer Cargo Ticket (Bayo sells the blenders in transit to Dele)",
    await ix.transferCargoTicket(p, {
      from: who.bayo.publicKey,
      to: who.buyer.publicKey,
      consignment: resold,
    }),
    [who.bayo],
  );
  await send(
    c,
    "open_dispute (missing cartons)",
    await ix.openDispute(p, { holder: who.chika.publicKey, consignment: disputed, reason: 3 }),
    [who.chika],
  );
}

// --- Harbour Link Logistics (new forwarder) -----------------------------------------
const harbour = await ensureForwarder(who.harbour, "Harbour Link Logistics", 1_500n);
let lag2207 = (await findContainer(c, harbour, "LAG-2207"))?.address ?? null;
if (lag2207) console.log("LAG-2207 exists, skipping");
else
  lag2207 = await openContainer(
    c,
    mint,
    who.harbour,
    "LAG-2207",
    ["CNYIW", "NGTIN"],
    350n,
    14 * DAY,
    55 * DAY,
    20_000,
  );

// --- Summary ------------------------------------------------------------------------------
const show = (label: string, path: string) => console.log(`${label.padEnd(26)} ${appUrl()}${path}`);
console.log("\nDemo world ready:");
if (lag1014) show("LAG-1014 (open)", `/c/${lag1014.toBase58()}`);
if (lag2207) show("LAG-2207 (new forwarder)", `/c/${lag2207.toBase58()}`);
show("Eastline Cargo", `/f/${eastline.toBase58()}`);
if (resold) show("Resold ticket (blenders)", `/s/${resold.toBase58()}`);
if (disputed) {
  const d: ConsignmentAccount | null = await getConsignment(p, disputed);
  show(`Dispute (${d ? Object.keys(d.status)[0] : "?"})`, `/s/${disputed.toBase58()}`);
  console.log(
    `\nResolve it through Squads:\n  pnpm --filter @manifest/scripts resolve-dispute --consignment ${disputed.toBase58()} --resolution slash --amount 500`,
  );
}
console.log(`\nEastline on Explorer: ${explorerUrl("address", eastline.toBase58(), c.cluster)}`);
