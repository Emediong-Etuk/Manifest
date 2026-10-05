/**
 * Shared Playwright helpers: local validator connection, the dev key (test-dollar mint
 * authority from seed:local), funding, and pages signed in with a localnet test wallet.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { type Browser, expect, type Page } from "@playwright/test";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";

const RPC = process.env.E2E_RPC_URL ?? "http://127.0.0.1:8899";
export const MINT = new PublicKey(process.env.E2E_MINT ?? "");
export const USD = 1_000_000n;

export const connection = new Connection(RPC, "confirmed");
export const admin = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      readFileSync(join(homedir(), ".config/solana/manifest-dev.json"), "utf8"),
    ) as number[],
  ),
);

export async function fund(owner: PublicKey, dollars: bigint) {
  const sig = await connection.requestAirdrop(owner, 10 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
  const ata = getAssociatedTokenAddressSync(MINT, owner);
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, ata, owner, MINT),
    createMintToInstruction(MINT, ata, admin.publicKey, dollars * USD),
  );
  await connection
    .sendTransaction(tx, [admin])
    .then((s) => connection.confirmTransaction(s, "confirmed"));
}

export async function walletPage(
  browser: Browser,
  kp: Keypair,
  viewport = { width: 412, height: 915 },
): Promise<Page> {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(
    (secret) => {
      window.localStorage.setItem("manifest.burner", secret);
    },
    JSON.stringify(Array.from(kp.secretKey)),
  );
  return context.newPage();
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.getByRole("status").filter({ hasText: text }).first()).toBeVisible({
    timeout: 60_000,
  });
}

/** Sign and send instructions with `signers[0]` as fee payer; waits for confirmation. */
export async function sendIxs(ixs: TransactionInstruction[], signers: Keypair[]): Promise<void> {
  const tx = new Transaction().add(...ixs);
  const sig = await connection.sendTransaction(tx, signers);
  const res = await connection.confirmTransaction(sig, "confirmed");
  if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
}
