/**
 * The crank: permissionless upkeep anyone may run. It only calls the two instructions the
 * program opens to any signer, and only when the program's own conditions hold:
 *  - `auto_approve` for a Received consignment once `now > review_deadline`
 *  - `close_booking` for an Open container once `now >= cutoff_ts`
 * It never calls forwarder-only or arbitrator instructions. Shared by `scripts/src/crank.ts`
 * and the app's `/api/cron/crank` route.
 */
import type { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";

import { type Fetched, listConsignments, listContainers } from "./accounts.js";
import type { ManifestProgram } from "./client.js";
import { autoApprove, closeBooking } from "./instructions.js";
import { decodeFixed } from "./format.js";
import type { ConsignmentAccount, ContainerAccount } from "./types.js";

export interface CrankJob {
  kind: "closeBooking" | "autoApprove";
  address: PublicKey;
  /** Human-readable target for logs. */
  label: string;
}

const secs = (v: { toString(): string }) => Number(v.toString());

/**
 * Pure selection: which accounts are due at `nowSecs`. Pass Open containers and Received
 * consignments (other statuses are ignored anyway). Mirrors the program's checks exactly.
 */
export function dueCrankJobs(
  containers: Fetched<ContainerAccount>[],
  consignments: Fetched<ConsignmentAccount>[],
  nowSecs: number,
): CrankJob[] {
  const jobs: CrankJob[] = [];
  for (const { address, account } of containers) {
    if ("open" in account.status && nowSecs >= secs(account.cutoffTs)) {
      jobs.push({ kind: "closeBooking", address, label: `container ${decodeFixed(account.code)}` });
    }
  }
  for (const { address, account } of consignments) {
    if ("received" in account.status && nowSecs > secs(account.reviewDeadline)) {
      jobs.push({ kind: "autoApprove", address, label: `consignment ${address.toBase58()}` });
    }
  }
  return jobs;
}

/**
 * The cluster's clock (block time of the latest confirmed slot), which is what the program
 * compares against. Falls back to the local clock if the RPC can't say.
 */
export async function chainNowSecs(connection: Connection): Promise<number> {
  try {
    const slot = await connection.getSlot("confirmed");
    const time = await connection.getBlockTime(slot);
    if (time !== null) return time;
  } catch {
    // fall through
  }
  return Math.floor(Date.now() / 1000);
}

/** Fetch Open containers and Received consignments and return the jobs due now. */
export async function findCrankJobs(
  program: ManifestProgram,
  nowSecs?: number,
): Promise<CrankJob[]> {
  const now = nowSecs ?? (await chainNowSecs(program.provider.connection));
  const [containers, consignments] = await Promise.all([
    listContainers(program, { status: "open" }),
    listConsignments(program, { status: "received" }),
  ]);
  return dueCrankJobs(containers, consignments, now);
}

/** Instructions for one job, with `payer` as caller (it pays the Cargo Ticket rent on auto-approve). */
export async function crankInstructions(
  program: ManifestProgram,
  payer: PublicKey,
  job: CrankJob,
): Promise<TransactionInstruction[]> {
  return job.kind === "closeBooking"
    ? closeBooking(program, { caller: payer, container: job.address })
    : autoApprove(program, { payer, consignment: job.address });
}
