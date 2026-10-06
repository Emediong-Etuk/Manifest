/**
 * Squads v4 helpers: the 2-of-3 arbitration multisig and "propose -> approve x2 -> execute"
 * for instructions signed by its vault PDA (index 0).
 * Docs: https://docs.squads.so/main/development/introduction/quickstart (program
 * SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf on mainnet and devnet, exported by
 * @sqds/multisig as PROGRAM_ID). Demo member keys live in .keys/ (gitignored).
 */
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import * as multisig from "@sqds/multisig";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  type TransactionInstruction,
  TransactionMessage,
} from "@solana/web3.js";

import { type Chain, send } from "./chain.js";
import { REPO_ROOT } from "./env.js";
import { devKeypair, keypairFromFile } from "./keys.js";

export const KEYS_DIR = resolve(REPO_ROOT, ".keys");
const STATE_FILE = resolve(KEYS_DIR, "squads.json");

/**
 * Load a keypair file from .keys/, creating it (mode 600) on first use. New keys are derived
 * from the dev key (HMAC-SHA256 of the name, used as the ed25519 seed), so any machine or
 * cloud session holding manifest-dev.json recreates the same demo cast and Squads members;
 * the dev key can't be recovered from them. Without a dev key file they are random.
 */
export function demoKeypair(name: string): Keypair {
  const path = resolve(KEYS_DIR, `${name}.json`);
  if (existsSync(path)) return keypairFromFile(path);
  mkdirSync(KEYS_DIR, { recursive: true, mode: 0o700 });
  let kp: Keypair;
  try {
    const seed = createHmac("sha256", devKeypair().secretKey)
      .update(`manifest-demo-key:v1:${name}`)
      .digest();
    kp = Keypair.fromSeed(seed);
  } catch {
    kp = Keypair.generate();
  }
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  console.log(`  created .keys/${name}.json (${kp.publicKey.toBase58()})`);
  return kp;
}

/** The two demo arbitrators that vote alongside Greg's wallet (2-of-3). */
export const arbitratorKeys = (): [Keypair, Keypair] => [
  demoKeypair("arbitrator-1"),
  demoKeypair("arbitrator-2"),
];

export interface SquadsInfo {
  multisig: PublicKey;
  vault: PublicKey;
}

export function vaultOf(multisigPda: PublicKey): PublicKey {
  return multisig.getVaultPda({ multisigPda, index: 0 })[0];
}

/**
 * From NEXT_PUBLIC_SQUADS_MULTISIG, else .keys/squads.json written by squads-setup for the
 * same cluster (a localnet multisig is ignored on devnet and vice versa).
 */
export function loadSquads(cluster: string): SquadsInfo | null {
  const env = process.env.NEXT_PUBLIC_SQUADS_MULTISIG;
  let address: string | undefined = env;
  if (!address && existsSync(STATE_FILE)) {
    const saved = JSON.parse(readFileSync(STATE_FILE, "utf8")) as {
      multisig: string;
      cluster?: string;
    };
    if (saved.cluster === cluster) address = saved.multisig;
  }
  if (!address) return null;
  const pda = new PublicKey(address);
  return { multisig: pda, vault: vaultOf(pda) };
}

export function saveSquads(info: SquadsInfo, cluster: string): void {
  mkdirSync(KEYS_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(
    STATE_FILE,
    JSON.stringify(
      { cluster, multisig: info.multisig.toBase58(), vault: info.vault.toBase58() },
      null,
      2,
    ),
  );
}

const isComputeBudget = (ix: TransactionInstruction) =>
  ix.programId.equals(ComputeBudgetProgram.programId);

/**
 * Wrap `instructions` (signed by the vault) in a vault transaction, open a proposal,
 * approve it with two members and execute it. Compute-budget instructions can't run
 * inside the vault transaction (it executes via CPI), so they move to the execute tx.
 */
export async function proposeApproveExecute(
  c: Chain,
  squads: SquadsInfo,
  label: string,
  instructions: TransactionInstruction[],
  voters: [Keypair, Keypair],
): Promise<string> {
  const [first, second] = voters;
  const ms = await multisig.accounts.Multisig.fromAccountAddress(c.connection, squads.multisig);
  const transactionIndex = BigInt(ms.transactionIndex.toString()) + 1n;
  const inner = instructions.filter((ix) => !isComputeBudget(ix));
  const units = instructions.some(isComputeBudget) ? 400_000 : 200_000;

  const message = new TransactionMessage({
    payerKey: squads.vault,
    recentBlockhash: (await c.connection.getLatestBlockhash()).blockhash, // not used by Squads
    instructions: inner,
  });
  await send(
    c,
    `squads: vault transaction #${transactionIndex} + proposal (${label})`,
    [
      multisig.instructions.vaultTransactionCreate({
        multisigPda: squads.multisig,
        transactionIndex,
        creator: first.publicKey,
        rentPayer: first.publicKey,
        vaultIndex: 0,
        ephemeralSigners: 0,
        transactionMessage: message,
        memo: label,
      }),
      multisig.instructions.proposalCreate({
        multisigPda: squads.multisig,
        transactionIndex,
        creator: first.publicKey,
        rentPayer: first.publicKey,
      }),
    ],
    [first],
  );
  for (const member of voters) {
    await send(
      c,
      `squads: approve by ${member.publicKey.toBase58().slice(0, 4)}…`,
      [
        multisig.instructions.proposalApprove({
          multisigPda: squads.multisig,
          transactionIndex,
          member: member.publicKey,
        }),
      ],
      [member],
    );
  }
  const { instruction } = await multisig.instructions.vaultTransactionExecute({
    connection: c.connection,
    multisigPda: squads.multisig,
    transactionIndex,
    member: second.publicKey,
  });
  return send(
    c,
    `squads: execute #${transactionIndex}`,
    [ComputeBudgetProgram.setComputeUnitLimit({ units }), instruction],
    [second],
  );
}
