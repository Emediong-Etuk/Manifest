/**
 * Evidence upload rules shared by the browser (signing) and POST /api/evidence
 * (verification). The signed message and field hash live in @manifest/sdk so operator
 * scripts (seed-demo) produce exactly the same signature:
 *   manifest-evidence:<consignment>:<sha256 of the fields>:<unix ts>
 */
export { type EvidenceFields, evidenceFieldsHash, evidenceMessage } from "@manifest/sdk";

export const EVIDENCE_MAX_AGE_SECS = 5 * 60;
export const MAX_PHOTOS = 8;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
