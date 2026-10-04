/** Formatting and parsing helpers for amounts, volumes, fixed strings, ports and codes. */
import BN from "bn.js";

import { USD_DECIMALS } from "./constants.js";

type Amount = bigint | number | BN;

const toBigInt = (v: Amount): bigint =>
  typeof v === "bigint" ? v : typeof v === "number" ? BigInt(Math.trunc(v)) : BigInt(v.toString());

/** Base units -> `$1,234.56` (always two decimals, rounded half up). */
export function formatUsd(amount: Amount, opts: { symbol?: boolean } = {}): string {
  const base = toBigInt(amount);
  const negative = base < 0n;
  const abs = negative ? -base : base;
  const cents = (abs + 5_000n) / 10_000n; // 6 decimals -> 2, half up
  const dollars = cents / 100n;
  const rem = (cents % 100n).toString().padStart(2, "0");
  const grouped = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${opts.symbol === false ? "" : "$"}${grouped}.${rem}`;
}

/** `"2,400.50"` / `"$2400.5"` -> base units. Throws on invalid input or > 6 decimals. */
export function parseUsd(input: string): bigint {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{0,6})?$/.test(cleaned)) throw new Error(`Invalid amount: ${input}`);
  const [whole, frac = ""] = cleaned.split(".");
  return (
    BigInt(whole ?? "0") * 10n ** BigInt(USD_DECIMALS) + BigInt(frac.padEnd(USD_DECIMALS, "0"))
  );
}

/** Milli-CBM -> `1.25 CBM` (trailing zeros trimmed, up to 3 decimals). */
export function formatCbm(milli: number, unit = "CBM"): string {
  const value = (milli / 1000).toFixed(3).replace(/\.?0+$/, "");
  return `${value} ${unit}`;
}

/** `"1.25"` -> 1250 milli-CBM. */
export function parseCbm(input: string): number {
  const cleaned = input.trim();
  if (!/^\d+(\.\d{0,3})?$/.test(cleaned)) throw new Error(`Invalid volume: ${input}`);
  return Math.round(Number(cleaned) * 1000);
}

/** CBM from carton dimensions in centimetres: L x W x H / 1,000,000 x cartons, in milli-CBM. */
export function cbmFromCartons(
  lengthCm: number,
  widthCm: number,
  heightCm: number,
  cartons: number,
): number {
  return Math.ceil((lengthCm * widthCm * heightCm * cartons) / 1_000);
}

/** UTF-8 string -> zero-padded fixed-size byte array (throws if too long). */
export function encodeFixed(value: string, length: number): number[] {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length > length) throw new Error(`"${value}" is longer than ${length} bytes`);
  const out = new Array<number>(length).fill(0);
  bytes.forEach((b, i) => (out[i] = b));
  return out;
}

/** Zero-padded byte array -> string. */
export function decodeFixed(bytes: ArrayLike<number>): string {
  const arr = Array.from(bytes);
  const end = arr.indexOf(0);
  return new TextDecoder().decode(Uint8Array.from(end === -1 ? arr : arr.slice(0, end)));
}

/** Ports and airports used in the demo corridor (UN/LOCODE). */
export const LOCODES: Record<string, { city: string; country: string }> = {
  CNCAN: { city: "Guangzhou", country: "China" },
  CNYIW: { city: "Yiwu", country: "China" },
  CNSZX: { city: "Shenzhen", country: "China" },
  CNNGB: { city: "Ningbo", country: "China" },
  CNSHA: { city: "Shanghai", country: "China" },
  NGAPP: { city: "Apapa", country: "Nigeria" },
  NGTIN: { city: "Tin Can", country: "Nigeria" },
  NGLOS: { city: "Lagos (air)", country: "Nigeria" },
  GHTEM: { city: "Tema", country: "Ghana" },
  KEMBA: { city: "Mombasa", country: "Kenya" },
  AEJEA: { city: "Jebel Ali", country: "UAE" },
  TRIST: { city: "Istanbul", country: "Türkiye" },
};

export function locodeCity(code: string): string {
  return LOCODES[code]?.city ?? code;
}

export function isValidLocode(code: string): boolean {
  return /^[A-Z]{2}[A-Z2-9]{3}$/.test(code);
}

/** ISO 6346 letter values: A=10 upwards, skipping multiples of 11. */
function iso6346LetterValue(c: string): number {
  let v = c.charCodeAt(0) - 65 + 10;
  for (const skipped of [11, 22, 33]) if (v >= skipped) v += 1;
  return v;
}

/** The ISO 6346 check digit for the first 10 characters, or null if malformed. */
export function iso6346CheckDigit(first10: string): number | null {
  if (!/^[A-Z]{3}[UJZ]\d{6}$/.test(first10)) return null;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const c = first10[i] as string;
    const value = i < 4 ? iso6346LetterValue(c) : Number(c);
    sum += value * 2 ** i;
  }
  return (sum % 11) % 10;
}

/** Validate a full container number like `CSQU3054383` (same rules as the program). */
export function isValidIso6346(number: string): boolean {
  const n = number.trim().toUpperCase();
  if (!/^[A-Z]{3}[UJZ]\d{7}$/.test(n)) return false;
  return iso6346CheckDigit(n.slice(0, 10)) === Number(n[10]);
}

/** `7xKX…9fQ2` */
export function shortAddress(address: string, chars = 4): string {
  return address.length <= chars * 2 + 1
    ? address
    : `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

/** Seconds -> `2d 4h`, `3h 12m`, `5m 09s`, or `now` when <= 0. */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "now";
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}
