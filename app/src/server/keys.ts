import "server-only";

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

/** Parse a secret key env var (base58 or a JSON byte array). Never logged. */
export function keypairFromEnv(name: string): Keypair | null {
  const value = process.env[name]?.trim();
  if (!value) return null;
  try {
    const bytes = value.startsWith("[")
      ? Uint8Array.from(JSON.parse(value) as number[])
      : bs58.decode(value);
    return Keypair.fromSecretKey(bytes);
  } catch {
    return null;
  }
}
