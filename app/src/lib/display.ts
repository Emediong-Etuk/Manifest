import { formatUsd } from "@manifest/sdk";
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

/** Whole dollars when there are no cents: `$14,300`, `$412.50`. */
export function formatUsdShort(amount: Parameters<typeof formatUsd>[0]): string {
  return formatUsd(amount).replace(/\.00$/, "");
}

type Secs = number | { toNumber(): number };
const toDate = (t: Secs | string) =>
  typeof t === "string" ? new Date(t) : new Date((typeof t === "number" ? t : t.toNumber()) * 1000);

/** `Oct 15, 2026, 1:58 PM` in the viewer's locale and time zone. */
export function formatDateTime(t: Secs | string): string {
  return toDate(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** `Oct 15, 2026`. */
export function formatDate(t: Secs | string): string {
  return toDate(t).toLocaleDateString(undefined, { dateStyle: "medium" });
}
