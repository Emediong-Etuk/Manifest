/**
 * Send one user action as one transaction: simulate (so program errors come back as
 * friendly messages before the wallet prompt), sign, send to the app's cluster, confirm.
 * Wallets that can sign without sending (Phantom extension/app) only sign; the app
 * broadcasts. Embedded wallets sign and send in one call.
 */
import { explorerUrl, friendlyError } from "@manifest/sdk";
import {
  type BlockhashWithExpiryBlockHeight,
  type Connection,
  type RpcResponseAndContext,
  type SignatureResult,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

import { getConnection } from "./chain";
import { config } from "./config";
import type { ManifestWallet } from "./wallet/types";

export class TxError extends Error {
  constructor(
    message: string,
    readonly detail: string,
  ) {
    super(message);
  }
}

export interface TxResult {
  signature: string;
  explorer: string;
}

/**
 * Send a signed transaction to the app's cluster and wait for confirmation, re-sending it
 * every 2 s until then: public devnet RPCs drop transactions under load. Re-sending is safe
 * (same signature, it can only land once) and stops when the blockhash expires.
 */
async function broadcast(
  connection: Connection,
  signed: VersionedTransaction,
  latest: BlockhashWithExpiryBlockHeight,
): Promise<{ signature: string; result: RpcResponseAndContext<SignatureResult> }> {
  const raw = signed.serialize();
  const signature = await connection.sendRawTransaction(raw, { maxRetries: 0 });
  const resend = setInterval(() => {
    connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => {});
  }, 2_000);
  try {
    const result = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
    return { signature, result };
  } finally {
    clearInterval(resend);
  }
}

export async function sendInstructions(
  wallet: ManifestWallet,
  instructions: TransactionInstruction[],
): Promise<TxResult> {
  if (!wallet.publicKey) throw new TxError("Connect your wallet first.", "no wallet");
  const connection = getConnection();
  try {
    const latest = await connection.getLatestBlockhash("confirmed");
    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: latest.blockhash,
        instructions,
      }).compileToV0Message(),
    );
    const sim = await connection.simulateTransaction(tx, {
      sigVerify: false,
      replaceRecentBlockhash: true,
    });
    if (sim.value.err) {
      throw Object.assign(new Error(JSON.stringify(sim.value.err)), {
        logs: sim.value.logs ?? [],
        ...(typeof sim.value.err === "object" ? sim.value.err : {}),
      });
    }
    const { signature, result } = wallet.signTransaction
      ? await broadcast(connection, await wallet.signTransaction(tx), latest)
      : await (async () => {
          const signature = await wallet.signAndSend(tx);
          const result = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
          return { signature, result };
        })();
    if (result.value.err) {
      const failed = await connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      throw Object.assign(new Error(JSON.stringify(result.value.err)), {
        logs: failed?.meta?.logMessages ?? [],
        ...(typeof result.value.err === "object" ? result.value.err : {}),
      });
    }
    return { signature, explorer: explorerUrl("tx", signature, config.cluster) };
  } catch (err) {
    if (err instanceof TxError) throw err;
    const { message, detail } = friendlyError(err);
    throw new TxError(message, detail);
  }
}
