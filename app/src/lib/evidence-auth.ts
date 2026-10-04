/**
 * The message a forwarder signs to upload receipt evidence:
 *   manifest-evidence:<consignment>:<sha256 of the fields>:<unix ts>
 * where the fields are canonical JSON of the form data plus each photo's SHA-256. Shared by
 * the browser (signing) and POST /api/evidence (verification).
 */
import { canonicalJson, sha256, toHex } from "@manifest/sdk";

export const EVIDENCE_MAX_AGE_SECS = 5 * 60;
export const MAX_PHOTOS = 8;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export interface EvidenceFields {
  consignment: string;
  measuredCbmMilli: number;
  cartonCount: number;
  packingList: { item: string; qty: number }[];
  notes: string;
  photoHashes: string[];
}

export async function evidenceFieldsHash(fields: EvidenceFields): Promise<string> {
  return toHex(await sha256(canonicalJson(fields)));
}

export function evidenceMessage(consignment: string, fieldsHash: string, ts: number): Uint8Array {
  return new TextEncoder().encode(`manifest-evidence:${consignment}:${fieldsHash}:${ts}`);
}
