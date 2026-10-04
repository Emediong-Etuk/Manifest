import "server-only";

import {
  defaultRpcUrl,
  getProgram,
  parseCluster,
  resolveProgramId,
  type ManifestProgram,
} from "@manifest/sdk";
import { Connection } from "@solana/web3.js";

let program: ManifestProgram | undefined;

/** Server-side read-only program client (RPC_URL may hold a server-only key). */
export function serverProgram(): ManifestProgram {
  if (!program) {
    const cluster = parseCluster(process.env.NEXT_PUBLIC_CLUSTER);
    const rpc = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || defaultRpcUrl(cluster);
    program = getProgram(
      new Connection(rpc, "confirmed"),
      resolveProgramId(process.env.NEXT_PUBLIC_PROGRAM_ID || undefined),
    );
  }
  return program;
}
