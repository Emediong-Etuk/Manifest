/**
 * Local equivalent of the faucet: send a wallet SOL for fees and mint it test dollars.
 *
 *   pnpm --filter @manifest/scripts fund-wallet --address <pubkey> [--dollars 500] [--sol 0.05]
 */
import { parseArgs } from "node:util";

import { explorerUrl } from "@manifest/sdk";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";

import { chain, send } from "./lib/chain.js";
import { demoMint, mintAuthority, USD } from "./lib/demo.js";
import { loadEnv } from "./lib/env.js";

loadEnv();
const { values } = parseArgs({
  options: {
    address: { type: "string" },
    dollars: { type: "string", default: "500" },
    sol: { type: "string", default: "0.05" },
  },
});
if (!values.address) {
  console.error("Usage: fund-wallet --address <pubkey> [--dollars 500] [--sol 0.05]");
  process.exit(1);
}
const owner = new PublicKey(values.address);
const dollars = BigInt(values.dollars);
const lamports = Math.round(Number(values.sol) * LAMPORTS_PER_SOL);

const c = chain();
const mint = await demoMint(c);
const authority = await mintAuthority(c, mint);
const ata = getAssociatedTokenAddressSync(mint, owner, true);
console.log(
  `Funding ${owner.toBase58()} on ${c.cluster}: ${dollars} test dollars + ${values.sol} SOL`,
);
await send(
  c,
  "fund wallet",
  [
    ...(lamports > 0
      ? [SystemProgram.transfer({ fromPubkey: authority.publicKey, toPubkey: owner, lamports })]
      : []),
    createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, ata, owner, mint),
    createMintToInstruction(mint, ata, authority.publicKey, dollars * USD),
  ],
  [authority],
);
console.log(explorerUrl("address", owner.toBase58(), c.cluster));
