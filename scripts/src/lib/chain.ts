/**
 * Connection, program client and a `send` helper that prints what it does and an
 * explorer link for every transaction.
 */
import {
  type Cluster,
  defaultRpcUrl,
  explorerUrl,
  friendlyError,
  getProgram,
  type ManifestProgram,
  parseCluster,
  resolveProgramId,
} from "@manifest/sdk";
import {
  Connection,
  type Keypair,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

export interface Chain {
  cluster: Cluster;
  connection: Connection;
  program: ManifestProgram;
}

export function chain(): Chain {
  const cluster = parseCluster(process.env.NEXT_PUBLIC_CLUSTER);
  const rpc = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || defaultRpcUrl(cluster);
  const connection = new Connection(rpc, "confirmed");
  const program = getProgram(connection, resolveProgramId(process.env.NEXT_PUBLIC_PROGRAM_ID));
  return { cluster, connection, program };
}

/** Sign with `signers[0]` as fee payer, send, confirm, and print an explorer link. */
export async function send(
  c: Chain,
  label: string,
  instructions: TransactionInstruction[],
  signers: Keypair[],
): Promise<string> {
  const [payer] = signers;
  if (!payer) throw new Error("send() needs at least one signer");
  const { blockhash, lastValidBlockHeight } = await c.connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign(signers);
  process.stdout.write(`→ ${label} ... `);
  try {
    const signature = await c.connection.sendTransaction(tx, { maxRetries: 5 });
    const result = await c.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    if (result.value.err) throw Object.assign(new Error("Transaction failed"), result.value.err);
    console.log(`ok\n  ${explorerUrl("tx", signature, c.cluster)}`);
    return signature;
  } catch (err) {
    const { message, detail } = friendlyError(err);
    console.log(`FAILED\n  ${message}\n  ${detail}`);
    throw err;
  }
}
