/**
 * Evidence manifests: canonical JSON (RFC 8785) + SHA-256. Runs unchanged in the browser
 * and in Node (both have WebCrypto as `globalThis.crypto`).
 */
import canonicalize from "canonicalize";

export const EVIDENCE_SCHEMA = "manifest.evidence.v1";

export interface EvidencePhoto {
  uri: string;
  sha256: string;
  width: number;
  height: number;
}

export interface EvidenceManifest {
  schema: typeof EVIDENCE_SCHEMA;
  consignment: string;
  container: string;
  forwarder: string;
  recordedAt: string;
  measuredCbmMilli: number;
  cartonCount: number;
  packingList: { item: string; qty: number }[];
  notes: string;
  photos: EvidencePhoto[];
}

export function canonicalJson(value: unknown): string {
  const out = canonicalize(value);
  if (out === undefined) throw new Error("Value cannot be canonicalized");
  return out;
}

export async function sha256(data: Uint8Array | string): Promise<Uint8Array> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return new Uint8Array(digest);
}

export const toHex = (bytes: ArrayLike<number>): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export function fromHex(hex: string): Uint8Array {
  if (!/^([0-9a-f]{2})*$/i.test(hex)) throw new Error("Invalid hex");
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (h) => Number.parseInt(h, 16));
}

/** Canonicalize and hash a manifest. `hash` is what `record_receipt` stores onchain. */
export async function hashEvidence(
  manifest: EvidenceManifest,
): Promise<{ canonical: string; hash: Uint8Array; hashHex: string }> {
  const canonical = canonicalJson(manifest);
  const hash = await sha256(canonical);
  return { canonical, hash, hashHex: toHex(hash) };
}

/** True when the manifest (object or JSON text) hashes to the onchain `evidence_hash`. */
export async function verifyEvidence(
  manifest: EvidenceManifest | string,
  onchainHash: ArrayLike<number>,
): Promise<boolean> {
  const value: unknown = typeof manifest === "string" ? JSON.parse(manifest) : manifest;
  const hash = await sha256(canonicalJson(value));
  return toHex(hash) === toHex(onchainHash);
}
