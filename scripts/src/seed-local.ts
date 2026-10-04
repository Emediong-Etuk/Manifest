/**
 * Local validator setup for UI development and browser tests: a 6-decimal test-dollar
 * mint (dev keypair = mint authority) and a Config with short windows. Prints the env vars
 * to start the app with. Localnet only.
 *
 * Usage: NEXT_PUBLIC_CLUSTER=localnet pnpm --filter @manifest/scripts seed:local
 */
import { encodeFixed, FIELD_LEN, getConfig, ix, type ConfigParams } from "@manifest/sdk";
import { createInitializeMint2Instruction, MINT_SIZE, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";

import { chain, send } from "./lib/chain.js";
import { loadEnv } from "./lib/env.js";
import { devKeypair } from "./lib/keys.js";

loadEnv();
process.env.NEXT_PUBLIC_CLUSTER = "localnet";
const c = chain();
const admin = devKeypair();

const existing = await getConfig(c.program);
if (existing) {
  console.log(`Config exists.\nNEXT_PUBLIC_DEMO_MINT=${existing.paymentMints[0]?.toBase58()}`);
  process.exit(0);
}

const sig = await c.connection.requestAirdrop(admin.publicKey, 100 * LAMPORTS_PER_SOL);
await c.connection.confirmTransaction(sig, "confirmed");

const mint = Keypair.generate();
await send(
  c,
  "create test-dollar mint",
  [
    SystemProgram.createAccount({
      fromPubkey: admin.publicKey,
      newAccountPubkey: mint.publicKey,
      space: MINT_SIZE,
      lamports: await c.connection.getMinimumBalanceForRentExemption(MINT_SIZE),
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(mint.publicKey, 6, admin.publicKey, null),
  ],
  [admin, mint],
);

const slots = [mint.publicKey, PublicKey.default, PublicKey.default, PublicKey.default];
const params: ConfigParams = {
  arbitrator: admin.publicKey,
  treasuryOwner: admin.publicKey,
  paymentMints: slots,
  bondMints: slots,
  feeBps: 75,
  coverageBps: 2_000,
  freightBufferBps: 1_000,
  reviewWindowSecs: new BN(600),
  pickupGraceSecs: new BN(300),
  disputeWindowSecs: new BN(600),
  overdueGraceSecs: new BN(600),
  onTimeGraceSecs: new BN(604_800),
  metadataBaseUri: encodeFixed("http://localhost:3000/api/tickets/", FIELD_LEN.metadataBaseUri),
  paused: false,
};
await send(
  c,
  "initialize_config",
  await ix.initializeConfig(c.program, { admin: admin.publicKey, params, mints: [mint.publicKey] }),
  [admin],
);
console.log(
  `\nNEXT_PUBLIC_CLUSTER=localnet\nNEXT_PUBLIC_RPC_URL=http://127.0.0.1:8899\nNEXT_PUBLIC_DEMO_MINT=${mint.publicKey.toBase58()}`,
);
