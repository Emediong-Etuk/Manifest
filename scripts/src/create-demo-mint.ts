/**
 * Creates the 6-decimal "Manifest Demo Dollar" (mUSD) mint on the configured cluster.
 * The gas-tank key (GAS_TANK_SECRET_KEY) pays and is the mint authority, so the faucet
 * can mint test dollars. Prints the mint address for NEXT_PUBLIC_DEMO_MINT.
 *
 * Usage: pnpm --filter @manifest/scripts create-demo-mint
 */
import { explorerUrl } from "@manifest/sdk";
import {
  createInitializeMint2Instruction,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

import { chain, send } from "./lib/chain.js";
import { loadEnv } from "./lib/env.js";
import { keypairFromEnv } from "./lib/keys.js";

loadEnv();
const c = chain();
const authority = keypairFromEnv("GAS_TANK_SECRET_KEY");

const existing = process.env.NEXT_PUBLIC_DEMO_MINT;
if (existing && (await c.connection.getAccountInfo(new PublicKey(existing)))) {
  console.log(`Demo mint already exists: ${existing}`);
  process.exit(0);
}

console.log(`Cluster:        ${c.cluster}`);
console.log(`Mint authority: ${authority.publicKey.toBase58()} (gas tank)`);
console.log("Creating a 6-decimal SPL Token mint: Manifest Demo Dollar (mUSD)\n");

const mint = Keypair.generate();
const lamports = await getMinimumBalanceForRentExemptMint(c.connection);
await send(
  c,
  "create mint",
  [
    SystemProgram.createAccount({
      fromPubkey: authority.publicKey,
      newAccountPubkey: mint.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
      mint.publicKey,
      6,
      authority.publicKey,
      null,
      TOKEN_PROGRAM_ID,
    ),
  ],
  [authority, mint],
);

console.log(`\nDemo mint: ${mint.publicKey.toBase58()}`);
console.log(`  ${explorerUrl("address", mint.publicKey.toBase58(), c.cluster)}`);
console.log(`\nAdd to .env.local:\nNEXT_PUBLIC_DEMO_MINT=${mint.publicKey.toBase58()}`);
