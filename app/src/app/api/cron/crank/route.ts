/**
 * GET /api/cron/crank: one crank pass (see packages/sdk/src/crank.ts). Calls only the
 * permissionless `auto_approve` (review window over) and `close_booking` (cut-off passed),
 * signed by CRANK_SECRET_KEY (falls back to GAS_TANK_SECRET_KEY).
 *
 * Callers must send `Authorization: Bearer $CRON_SECRET`: Vercel Cron does this itself
 * (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs), and the
 * GitHub Actions schedule in .github/workflows/crank.yml does it for 5-minute runs
 * (Vercel Hobby only allows daily crons). Duplicate or overlapping runs are harmless: the
 * program rejects a second auto_approve/close_booking on the same account.
 */
import { timingSafeEqual } from "node:crypto";

import {
  crankInstructions,
  explorerUrl,
  findCrankJobs,
  friendlyError,
  parseCluster,
} from "@manifest/sdk";

import { sendServerTx, serverProgram } from "@/server/chain";
import { keypairFromEnv } from "@/server/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Jobs per run, so one invocation stays well inside maxDuration. */
const MAX_JOBS = 12;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const payer = keypairFromEnv("CRANK_SECRET_KEY") ?? keypairFromEnv("GAS_TANK_SECRET_KEY");
  if (!payer) return Response.json({ error: "No crank key configured" }, { status: 503 });

  const cluster = parseCluster(process.env.NEXT_PUBLIC_CLUSTER);
  const program = serverProgram();
  const jobs = await findCrankJobs(program);
  const results = [];
  for (const job of jobs.slice(0, MAX_JOBS)) {
    try {
      const signature = await sendServerTx(
        await crankInstructions(program, payer.publicKey, job),
        payer,
      );
      results.push({
        ...job,
        address: job.address.toBase58(),
        ok: true,
        explorer: explorerUrl("tx", signature, cluster),
      });
    } catch (err) {
      const { message } = friendlyError(err);
      console.error(`[crank] ${job.kind} ${job.label} failed: ${message}`);
      results.push({ ...job, address: job.address.toBase58(), ok: false, error: message });
    }
  }
  return Response.json({ due: jobs.length, ran: results.length, results });
}
