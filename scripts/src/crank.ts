/**
 * Crank: runs the permissionless upkeep the program allows anyone to do.
 *  - auto_approve consignments whose review window has ended (the trader stayed silent)
 *  - close_booking on containers past their cut-off
 * Never calls forwarder-only or arbitrator instructions. Signs with CRANK_SECRET_KEY
 * (falls back to the dev key), which pays fees and the Cargo Ticket rent on auto-approval.
 *
 *   pnpm --filter @manifest/scripts crank            # one pass
 *   pnpm --filter @manifest/scripts crank --watch    # every 30 s (CRANK_INTERVAL_SECS)
 * In production the same pass runs from Vercel Cron: GET /api/cron/crank (app/vercel.json).
 */
import { crankInstructions, findCrankJobs } from "@manifest/sdk";
import type { Keypair } from "@solana/web3.js";

import { chain, send, type Chain } from "./lib/chain.js";
import { loadEnv } from "./lib/env.js";
import { devKeypair, keypairFromEnv } from "./lib/keys.js";

loadEnv();

async function pass(c: Chain, payer: Keypair): Promise<{ done: number; failed: number }> {
  const jobs = await findCrankJobs(c.program);
  let done = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      const ixs = await crankInstructions(c.program, payer.publicKey, job);
      await send(c, `${job.kind} ${job.label}`, ixs, [payer]);
      done += 1;
    } catch {
      // `send` already printed the friendly error; keep going with the other jobs.
      failed += 1;
    }
  }
  console.log(
    `[${new Date().toISOString()}] crank: ${jobs.length} due, ${done} ok, ${failed} failed`,
  );
  return { done, failed };
}

async function main() {
  const c = chain();
  const payer = process.env.CRANK_SECRET_KEY ? keypairFromEnv("CRANK_SECRET_KEY") : devKeypair();
  console.log(`Crank on ${c.cluster} as ${payer.publicKey.toBase58()}`);
  if (!process.argv.includes("--watch")) {
    const { failed } = await pass(c, payer);
    process.exitCode = failed > 0 ? 1 : 0;
    return;
  }
  const interval = Number(process.env.CRANK_INTERVAL_SECS ?? 30) * 1000;
  for (;;) {
    await pass(c, payer).catch((err: unknown) => console.error("crank pass failed:", err));
    await new Promise((r) => setTimeout(r, interval));
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
