import type { PublicKey } from "@solana/web3.js";

import { config } from "./config";

/** Token symbol shown in small text next to dollar amounts. */
export function mintSymbol(mint: PublicKey | null | undefined): string {
  if (!mint) return "";
  if (config.demoMint?.equals(mint)) return "mUSD";
  if (config.usdcMint?.equals(mint)) return "USDC";
  return "USD";
}

export function shareText(code: string, from: string, to: string, url: string): string {
  return `Space available on container ${code} (${from} → ${to}). Your money stays locked until your goods are checked at the warehouse. Book here: ${url}`;
}
