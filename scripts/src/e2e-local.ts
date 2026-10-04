/**
 * End-to-end check of the SDK against a local validator running the real program:
 * config -> forwarder + bond -> container -> 2 bookings -> receipts -> manual approval
 * + crank auto-approval -> load -> arrive -> Cargo Ticket resale -> 2 pickups ->
 * container Completed. Every instruction is built by @manifest/sdk.
 *
 * Start the validator first (the admin must be the upgrade authority):
 *   solana-test-validator --reset \
 *     --upgradeable-program <PROGRAM_ID> target/deploy/manifest.so <ADMIN_PUBKEY>
 * Then: NEXT_PUBLIC_CLUSTER=localnet pnpm --filter @manifest/scripts e2e:local
 */
import {
  consignmentStatus,
  containerStatus,
  deriveStage,
  encodeFixed,
  FIELD_LEN,
  findCargoTicketHolder,
  getConsignment,
  getContainer,
  hashEvidence,
  ix,
  listConsignments,
  listContainers,
  nextConsignmentAddressFor,
  toConsignmentView,
  toContainerView,
  type ConfigParams,
} from "@manifest/sdk";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";

import { chain, send } from "./lib/chain.js";
import { loadEnv } from "./lib/env.js";
import { devKeypair } from "./lib/keys.js";

loadEnv();
process.env.NEXT_PUBLIC_CLUSTER ||= "localnet";
const c = chain();
if (c.cluster !== "localnet") throw new Error("e2e-local only runs against localnet");

const USD = 1_000_000n;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Missing ${what}`);
  return value;
}
function check(cond: boolean, what: string): void {
  if (!cond) throw new Error(`CHECK FAILED: ${what}`);
  console.log(`  ✓ ${what}`);
}

const admin = devKeypair();
const arbitrator = Keypair.generate();
const forwarder = Keypair.generate();
const traderA = Keypair.generate();
const traderB = Keypair.generate();
const traders = [traderA, traderB];
const buyer = Keypair.generate();
const crank = Keypair.generate();

for (const kp of [admin, arbitrator, forwarder, ...traders, buyer, crank]) {
  const sig = await c.connection.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL);
  await c.connection.confirmTransaction(sig, "confirmed");
}

// Test dollar mint (admin is mint authority).
const mintKp = Keypair.generate();
const mint = mintKp.publicKey;
await send(
  c,
  "create mint",
  [
    SystemProgram.createAccount({
      fromPubkey: admin.publicKey,
      newAccountPubkey: mint,
      space: MINT_SIZE,
      lamports: await c.connection.getMinimumBalanceForRentExemption(MINT_SIZE),
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(mint, 6, admin.publicKey, null),
  ],
  [admin, mintKp],
);
async function fund(owner: PublicKey, amount: bigint): Promise<void> {
  const ata = getAssociatedTokenAddressSync(mint, owner, true);
  await send(
    c,
    `fund ${owner.toBase58().slice(0, 4)}`,
    [
      createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, ata, owner, mint),
      createMintToInstruction(mint, ata, admin.publicKey, amount),
    ],
    [admin],
  );
}
await fund(forwarder.publicKey, 5_000n * USD);
for (const t of traders) await fund(t.publicKey, 10_000n * USD);

// Config with very short windows so the run takes seconds.
const params: ConfigParams = {
  arbitrator: arbitrator.publicKey,
  treasuryOwner: admin.publicKey,
  paymentMints: [mint, PublicKey.default, PublicKey.default, PublicKey.default],
  bondMints: [mint, PublicKey.default, PublicKey.default, PublicKey.default],
  feeBps: 75,
  coverageBps: 2_000,
  freightBufferBps: 1_000,
  reviewWindowSecs: new BN(2),
  pickupGraceSecs: new BN(2),
  disputeWindowSecs: new BN(600),
  overdueGraceSecs: new BN(600),
  onTimeGraceSecs: new BN(604_800),
  metadataBaseUri: encodeFixed("http://localhost:3000/api/tickets/", FIELD_LEN.metadataBaseUri),
  paused: false,
};
const p = c.program;
await send(
  c,
  "initialize_config",
  await ix.initializeConfig(p, { admin: admin.publicKey, params, mints: [mint] }),
  [admin],
);

// Forwarder.
await send(
  c,
  "register_forwarder",
  await ix.registerForwarder(p, {
    authority: forwarder.publicKey,
    name: "Eastline Cargo",
    bondMint: mint,
  }),
  [forwarder],
);
await send(
  c,
  "deposit_bond",
  await ix.depositBond(p, { authority: forwarder.publicKey, amount: 5_000n * USD }),
  [forwarder],
);
const container = await ix.nextContainerAddress(p, forwarder.publicKey);
const now = Math.floor(Date.now() / 1000);
await send(
  c,
  "open_container",
  await ix.openContainer(p, {
    authority: forwarder.publicKey,
    code: "LAG-1014",
    origin: "CNCAN",
    destination: "NGAPP",
    mode: "sea",
    mint,
    capacityCbmMilli: 28_000,
    ratePerCbm: 380n * USD,
    cutoffTs: now + 3_600,
    etaTs: now + 7_200,
  }),
  [forwarder],
);

// Bookings, receipts, approvals.
const ks: PublicKey[] = [];
for (const t of [traderA, traderB]) {
  const k = await nextConsignmentAddressFor(p, container);
  await send(
    c,
    "book_consignment",
    await ix.bookConsignment(p, {
      trader: t.publicKey,
      container,
      goodsAmount: 2_400n * USD,
      estCbmMilli: 1_250,
      payee: Keypair.generate().publicKey,
      description: "Phone cases, 12 cartons",
    }),
    [t],
  );
  ks.push(k);
}
const kA = must(ks[0], "consignment A");
const kB = must(ks[1], "consignment B");
check(
  (await listConsignments(p, { container })).length === 2,
  "listConsignments(container) finds 2",
);
check(
  (await listConsignments(p, { trader: traderA.publicKey })).length === 1,
  "listConsignments(trader) finds 1",
);

for (const k of ks) {
  const { hash } = await hashEvidence({
    schema: "manifest.evidence.v1",
    consignment: k.toBase58(),
    container: container.toBase58(),
    forwarder: forwarder.publicKey.toBase58(),
    recordedAt: new Date().toISOString(),
    measuredCbmMilli: 1_000,
    cartonCount: 12,
    packingList: [{ item: "Phone cases", qty: 2_400 }],
    notes: "",
    photos: [],
  });
  await send(
    c,
    "record_receipt",
    await ix.recordReceipt(p, {
      authority: forwarder.publicKey,
      consignment: k,
      evidenceHash: hash,
      measuredCbmMilli: 1_000,
      cartonCount: 12,
    }),
    [forwarder],
  );
}
await send(
  c,
  "approve_goods",
  await ix.approveGoods(p, { trader: traderA.publicKey, consignment: kA }),
  [traderA],
);
await sleep(3_500);
await send(
  c,
  "auto_approve (crank)",
  await ix.autoApprove(p, { payer: crank.publicKey, consignment: kB }),
  [crank],
);
check(
  (await listConsignments(p, { container, status: "approved" })).length === 2,
  "both consignments approved (status memcmp filter)",
);

// Voyage.
await send(
  c,
  "close_booking",
  await ix.closeBooking(p, { caller: forwarder.publicKey, container }),
  [forwarder],
);
await send(
  c,
  "mark_loaded",
  await ix.markLoaded(p, {
    authority: forwarder.publicKey,
    container,
    containerNumber: "CSQU3054383",
    blHash: new Uint8Array(32).fill(9),
  }),
  [forwarder],
);
await send(
  c,
  "mark_arrived",
  await ix.markArrived(p, { authority: forwarder.publicKey, container }),
  [forwarder],
);

// Resale of trader 0's Cargo Ticket, then pickups.
const k0 = must(await getConsignment(p, kA), "consignment A account");
await send(
  c,
  "transfer Cargo Ticket",
  await ix.transferCargoTicket(p, {
    from: traderA.publicKey,
    to: buyer.publicKey,
    consignment: kA,
  }),
  [traderA],
);
const holder = await findCargoTicketHolder(p, k0.cargoTicketMint);
check(holder?.owner.equals(buyer.publicKey) === true, "findCargoTicketHolder returns the buyer");
const kc = must(await getContainer(p, container), "container account");
check(
  deriveStage(toConsignmentView(k0), toContainerView(kc), Math.floor(Date.now() / 1000)) ===
    "ARRIVED_READY_FOR_PICKUP",
  "deriveStage = ARRIVED_READY_FOR_PICKUP",
);
await send(
  c,
  "confirm_pickup (buyer)",
  await ix.confirmPickup(p, { holder: buyer.publicKey, consignment: kA }),
  [buyer],
);
await send(
  c,
  "confirm_pickup (trader)",
  await ix.confirmPickup(p, { holder: traderB.publicKey, consignment: kB }),
  [traderB],
);

for (const k of ks) {
  check(
    consignmentStatus(must(await getConsignment(p, k), "consignment")) === "delivered",
    `${k.toBase58().slice(0, 6)} delivered`,
  );
}
check(
  containerStatus(must(await getContainer(p, container), "container")) === "completed",
  "container completed",
);
check(
  (await listContainers(p, { status: "completed" })).length >= 1,
  "listContainers(status) finds it",
);
console.log("\nE2E OK: the SDK drove the full lifecycle on a local validator.");
