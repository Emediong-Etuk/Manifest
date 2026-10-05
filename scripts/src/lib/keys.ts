/**
 * Keypair loading for scripts. Secrets come from env vars (base58 or a JSON byte array)
 * or from files outside the repo. Nothing here ever prints a secret.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

/** Parse a secret key given as base58 or as a JSON array of 64 bytes. */
export function keypairFromSecret(secret: string): Keypair {
  const trimmed = secret.trim();
  const bytes = trimmed.startsWith("[")
    ? Uint8Array.from(JSON.parse(trimmed) as number[])
    : bs58.decode(trimmed);
  return Keypair.fromSecretKey(bytes);
}

export function keypairFromFile(path: string): Keypair {
  const expanded = path.startsWith("~") ? resolve(homedir(), path.slice(2)) : path;
  return keypairFromSecret(readFileSync(expanded, "utf8"));
}

/** Read a keypair from env var `name`, or throw with a pointer to `.env.example`. */
export function keypairFromEnv(name: string): Keypair {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Add it to .env.local (see .env.example).`);
  return keypairFromSecret(value);
}

/** The deploy/admin key: MANIFEST_DEV_KEYPAIR_PATH or ~/.config/solana/manifest-dev.json. */
export function devKeypair(): Keypair {
  return keypairFromFile(
    process.env.MANIFEST_DEV_KEYPAIR_PATH ?? "~/.config/solana/manifest-dev.json",
  );
}
