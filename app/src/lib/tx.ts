/**
 * Send one user action as one transaction: simulate (so program errors come back as
 * friendly messages before the wallet prompt), sign and send via the wallet, confirm.
 */
import { explorerUrl, friendlyError } from "@manifest/sdk";
import {
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
    const signature = await wallet.signAndSend(tx);
    const result = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
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
