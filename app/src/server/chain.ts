import "server-only";

import {
  defaultRpcUrl,
  getProgram,
  parseCluster,
  resolveProgramId,
  type ManifestProgram,
} from "@manifest/sdk";
import {
  Connection,
  type Keypair,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

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

/** Sign with a server key (fee payer), send, and wait for confirmation. Throws on failure. */
export async function sendServerTx(
  instructions: TransactionInstruction[],
  payer: Keypair,
): Promise<string> {
  const connection = serverProgram().provider.connection;
  const latest = await connection.getLatestBlockhash("confirmed");
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: latest.blockhash,
      instructions,
    }).compileToV0Message(),
  );
  tx.sign([payer]);
  const signature = await connection.sendTransaction(tx, { maxRetries: 3 });
  const result = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  if (result.value.err) throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`);
  return signature;
}
