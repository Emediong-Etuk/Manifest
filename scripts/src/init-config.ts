/**
 * Initializes (or with --update, updates) the Manifest Config with demo-friendly windows:
 * review 120 s, pickup grace 300 s, dispute window 600 s, overdue grace 600 s.
 * Payment and bond mints: the demo mint plus Circle devnet USDC when configured.
 * Arbitrator and treasury: the Squads vault if NEXT_PUBLIC_SQUADS_VAULT is set, else the
 * admin (scripts/squads-setup.ts switches them later).
 *
 * The admin must be the program's upgrade authority (the dev keypair that deployed it).
 * Usage: pnpm --filter @manifest/scripts init-config [--update]
 */
import { encodeFixed, FIELD_LEN, getConfig, ix, type ConfigParams } from "@manifest/sdk";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

import { chain, send } from "./lib/chain.js";
import { loadEnv, requireEnv } from "./lib/env.js";
import { devKeypair } from "./lib/keys.js";

loadEnv();
const c = chain();
const admin = devKeypair();
const update = process.argv.includes("--update");

const demoMint = new PublicKey(requireEnv("NEXT_PUBLIC_DEMO_MINT"));
const usdc = process.env.NEXT_PUBLIC_USDC_MINT
  ? new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT)
  : null;
const vault = process.env.NEXT_PUBLIC_SQUADS_VAULT
  ? new PublicKey(process.env.NEXT_PUBLIC_SQUADS_VAULT)
  : null;
const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

const mints = [demoMint, ...(usdc ? [usdc] : [])];
const slots = [...mints, ...Array<PublicKey>(4 - mints.length).fill(PublicKey.default)];

const params: ConfigParams = {
  arbitrator: vault ?? admin.publicKey,
  treasuryOwner: vault ?? admin.publicKey,
  paymentMints: slots,
  bondMints: slots,
  feeBps: 75,
  coverageBps: 2_000,
  freightBufferBps: 1_000,
  reviewWindowSecs: new BN(120),
  pickupGraceSecs: new BN(300),
  disputeWindowSecs: new BN(600),
  overdueGraceSecs: new BN(600),
  onTimeGraceSecs: new BN(604_800),
  metadataBaseUri: encodeFixed(`${appUrl}/api/tickets/`, FIELD_LEN.metadataBaseUri),
  paused: false,
};

console.log(`Cluster:     ${c.cluster}`);
console.log(`Program:     ${c.program.programId.toBase58()}`);
console.log(`Admin:       ${admin.publicKey.toBase58()}`);
console.log(
  `Arbitrator:  ${params.arbitrator.toBase58()}${vault ? " (Squads vault)" : " (admin; set NEXT_PUBLIC_SQUADS_VAULT later)"}`,
);
console.log(`Mints:       ${mints.map((m) => m.toBase58()).join(", ")}`);
console.log(`Ticket URIs: ${appUrl}/api/tickets/<consignment>\n`);

const existing = await getConfig(c.program);
if (existing && !update) {
  console.log("Config already initialized. Re-run with --update to change it.");
  process.exit(0);
}

const instructions = existing
  ? await ix.updateConfig(c.program, { admin: admin.publicKey, params, mints })
  : await ix.initializeConfig(c.program, { admin: admin.publicKey, params, mints });
await send(c, existing ? "update_config" : "initialize_config", instructions, [admin]);
console.log("\nConfig ready.");
