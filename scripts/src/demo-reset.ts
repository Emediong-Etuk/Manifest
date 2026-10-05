/**
 * Fresh demo state for re-recording videos, without redeploying: opens a new Eastline
 * container (cut-off in 10 days, ETA in 50) with the three staged shipments (approved,
 * waiting for review, booked), and a new empty Harbour Link container. Old containers stay
 * onchain; they are the forwarders' history. Run seed-demo first.
 *
 *   pnpm --filter @manifest/scripts demo-reset [--code LAG-1021]
 */
import { parseArgs } from "node:util";

import { forwarderPda } from "@manifest/sdk";

import { chain } from "./lib/chain.js";
import {
  appUrl,
  cast,
  DAY,
  demoMint,
  ensureDollars,
  findContainer,
  mintAuthority,
  openContainer,
  stagedShipments,
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

// A code that isn't taken yet: --code, else LAG-1015, LAG-1016, ...
async function freeCode(forwarder: typeof eastline, start: number): Promise<string> {
  for (let n = start; n < start + 500; n++) {
    const code = `LAG-${n}`;
    if (!(await findContainer(c, forwarder, code))) return code;
  }
  throw new Error("No free container code");
}
const eastCode = values.code ?? (await freeCode(eastline, 1015));
const harbourCode = await freeCode(harbour, 2208);

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

console.log(`\n${eastCode.padEnd(10)} ${appUrl()}/c/${east.toBase58()}`);
console.log(`${harbourCode.padEnd(10)} ${appUrl()}/c/${harb.toBase58()}`);
