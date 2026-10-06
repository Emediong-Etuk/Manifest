/**
 * Fresh demo state for re-recording videos, without redeploying: opens a new Eastline
 * container (cut-off in 10 days, ETA in 50) with the three staged shipments (approved,
 * waiting for review, booked), a new empty Harbour Link container, and a new arrived
 * Eastline container (LAG-0931, ...) with a pickup-ready shipment, a resold ticket and an
 * open dispute, since each take uses up a pickup and a dispute. Old containers stay
 * onchain; they are the forwarders' history. Run seed-demo first.
 *
 *   pnpm --filter @manifest/scripts demo-reset [--code LAG-1021]
 */
import { parseArgs } from "node:util";

import { forwarderPda, getConfig, ix } from "@manifest/sdk";

import { chain, send } from "./lib/chain.js";
import {
  appUrl,
  arrivedShipments,
  cast,
  DAY,
  demoMint,
  ensureDollars,
  findContainer,
  mintAuthority,
  openContainer,
  RESET_GOODS,
  stagedShipments,
  USD,
} from "./lib/demo.js";
import { loadEnv } from "./lib/env.js";

loadEnv();
const { values } = parseArgs({ options: { code: { type: "string" } } });
const c = chain();
const who = cast();
const mint = await demoMint(c);
const authority = await mintAuthority(c, mint);

const eastline = forwarderPda(who.eastline.publicKey, c.program.programId);
const harbour = forwarderPda(who.harbour.publicKey, c.program.programId);
for (const f of [eastline, harbour]) {
  if (!(await c.program.account.forwarder.fetchNullable(f))) {
    throw new Error("Demo forwarders not found. Run seed-demo first.");
  }
}

// A code that isn't taken yet: --code, else LAG-1015, LAG-1016, ... (4 digits: LAG-0931)
async function freeCode(forwarder: typeof eastline, start: number): Promise<string> {
  for (let n = start; n < start + 500; n++) {
    const code = `LAG-${String(n).padStart(4, "0")}`;
    if (!(await findContainer(c, forwarder, code))) return code;
  }
  throw new Error("No free container code");
}
const eastCode = values.code ?? (await freeCode(eastline, 1015));
const harbourCode = await freeCode(harbour, 2208);

// Eastline's guarantee must cover a share of all its open goods (coverage_bps), and every
// reset adds RESET_GOODS more: top it up by exactly what the new shipments need.
const config = await getConfig(c.program);
if (!config) throw new Error("Config not initialized.");
const f = await c.program.account.forwarder.fetch(eastline);
const extra = (RESET_GOODS * USD * BigInt(config.coverageBps) + 9_999n) / 10_000n;
const shortfall = BigInt(f.lockedCoverage.toString()) + extra - BigInt(f.bondBalance.toString());
if (shortfall > 0n) {
  await ensureDollars(c, mint, authority, who.eastline.publicKey, shortfall / USD + 1n);
  await send(
    c,
    `deposit_bond Eastline (+$${shortfall / USD + 1n})`,
    await ix.depositBond(c.program, { authority: who.eastline.publicKey, amount: shortfall + USD }),
    [who.eastline],
  );
}

for (const t of [who.ada, who.bayo, who.chika]) {
  await ensureDollars(c, mint, authority, t.publicKey, 25_000n);
}
const east = await openContainer(
  c,
  mint,
  who.eastline,
  eastCode,
  ["CNCAN", "NGAPP"],
  380n,
  10 * DAY,
  50 * DAY,
);
await stagedShipments(c, who, east);
const harb = await openContainer(
  c,
  mint,
  who.harbour,
  harbourCode,
  ["CNYIW", "NGTIN"],
  350n,
  14 * DAY,
  55 * DAY,
  20_000,
);

// A fresh arrived container for the pickup and dispute scenes (each take uses them up).
const arrivedCode = await freeCode(eastline, 931);
const arrived = await arrivedShipments(
  c,
  mint,
  who,
  arrivedCode,
  412_000 + Number(arrivedCode.slice(4)),
);

console.log(`\n${eastCode.padEnd(10)} ${appUrl()}/c/${east.toBase58()}`);
console.log(`${harbourCode.padEnd(10)} ${appUrl()}/c/${harb.toBase58()}`);
console.log(`${arrivedCode.padEnd(10)} ${appUrl()}/c/${arrived.container.toBase58()} (arrived)`);
console.log(`  Ada's pickup (hair extensions): ${appUrl()}/s/${arrived.pickup.toBase58()}`);
console.log(`  Resold ticket (Dele holds it):  ${appUrl()}/s/${arrived.resold.toBase58()}`);
console.log(`  Dispute (missing cartons):      ${appUrl()}/s/${arrived.disputed.toBase58()}`);
console.log(
  `  Resolve: pnpm --filter @manifest/scripts resolve-dispute --consignment ${arrived.disputed.toBase58()} --resolution slash --amount 500`,
);
