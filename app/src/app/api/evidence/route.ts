/**
 * POST /api/evidence (multipart): the forwarder uploads receipt evidence for a booked
 * consignment. Returns `{ manifestUri, manifestHashHex }`; the client then sends
 * `record_receipt` with that hash, so the evidence can't be swapped later.
 */
import {
  consignmentStatus,
  EVIDENCE_SCHEMA,
  type EvidenceManifest,
  hashEvidence,
  sha256,
  toHex,
} from "@manifest/sdk";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import sharp from "sharp";
import nacl from "tweetnacl";
import { z } from "zod";

import {
  EVIDENCE_MAX_AGE_SECS,
  evidenceFieldsHash,
  evidenceMessage,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
} from "@/lib/evidence-auth";
import { serverProgram } from "@/server/chain";
import { evidenceStore, manifestName } from "@/server/storage";

export const runtime = "nodejs";

const fieldsSchema = z.object({
  consignment: z.string().min(32).max(44),
  measuredCbmMilli: z.coerce.number().int().positive().max(1_000_000),
  cartonCount: z.coerce.number().int().positive().max(65_535),
  packingList: z
    .string()
    .transform((s) => JSON.parse(s) as unknown)
    .pipe(
      z
        .array(z.object({ item: z.string().min(1).max(120), qty: z.number().int().positive() }))
        .max(50),
    ),
  notes: z.string().max(500).default(""),
  signer: z.string().min(32).max(44),
  ts: z.coerce.number().int().positive(),
  signature: z.string().min(64).max(128),
});

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "Expected multipart form data");
  }
  const parsed = fieldsSchema.safeParse(
    Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")),
  );
  if (!parsed.success) return fail(400, "Invalid fields");
  const f = parsed.data;

  const photos = form.getAll("photos").filter((p): p is File => p instanceof File);
  if (photos.length < 1 || photos.length > MAX_PHOTOS)
    return fail(400, `Attach 1 to ${MAX_PHOTOS} photos`);
  if (photos.some((p) => p.size > MAX_PHOTO_BYTES))
    return fail(400, "A photo is larger than 10 MB");

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - f.ts) > EVIDENCE_MAX_AGE_SECS)
    return fail(401, "Signature expired; try again");

  // 1. Verify the forwarder's signature over the exact fields and photo bytes.
  const originals = await Promise.all(
    photos.map(async (p) => new Uint8Array(await p.arrayBuffer())),
  );
  const photoHashes = await Promise.all(originals.map(async (b) => toHex(await sha256(b))));
  const fieldsHash = await evidenceFieldsHash({
    consignment: f.consignment,
    measuredCbmMilli: f.measuredCbmMilli,
    cartonCount: f.cartonCount,
    packingList: f.packingList,
    notes: f.notes,
    photoHashes,
  });
  let signer: PublicKey;
  let consignment: PublicKey;
  try {
    signer = new PublicKey(f.signer);
    consignment = new PublicKey(f.consignment);
  } catch {
    return fail(400, "Invalid address");
  }
  const ok = nacl.sign.detached.verify(
    evidenceMessage(f.consignment, fieldsHash, f.ts),
    bs58.decode(f.signature),
    signer.toBytes(),
  );
  if (!ok) return fail(401, "Signature doesn't match");

  // 2. The signer must be this consignment's forwarder, and the goods not yet received.
  const program = serverProgram();
  const c = await program.account.consignment.fetchNullable(consignment);
  if (!c) return fail(404, "Shipment not found");
  if (consignmentStatus(c) !== "booked")
    return fail(409, "Evidence was already recorded for this shipment");
  const container = await program.account.container.fetch(c.container);
  const forwarder = await program.account.forwarder.fetch(container.forwarder);
  if (!forwarder.authority.equals(signer))
    return fail(403, "Only this container's forwarder can upload evidence");

  // 3. Strip EXIF (sharp drops metadata; .rotate() applies orientation first), resize, store.
  const store = evidenceStore();
  const stored = await Promise.all(
    originals.map(async (bytes) => {
      const { data, info } = await sharp(bytes)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      const hash = toHex(await sha256(data));
      const file = await store.put(`${hash}.jpg`, data, "image/jpeg");
      return { uri: file.uri, sha256: hash, width: info.width, height: info.height };
    }),
  );

  // 4. Canonical manifest -> SHA-256 (goes onchain via record_receipt).
  const manifest: EvidenceManifest = {
    schema: EVIDENCE_SCHEMA,
    consignment: f.consignment,
    container: c.container.toBase58(),
    forwarder: container.forwarder.toBase58(),
    recordedAt: new Date(now * 1000).toISOString(),
    measuredCbmMilli: f.measuredCbmMilli,
    cartonCount: f.cartonCount,
    packingList: f.packingList,
    notes: f.notes,
    photos: stored,
  };
  const { canonical, hashHex } = await hashEvidence(manifest);
  const file = await store.put(
    manifestName(f.consignment),
    new TextEncoder().encode(canonical),
    "application/json",
  );
  return Response.json({ manifestUri: file.uri, manifestHashHex: hashHex });
}
