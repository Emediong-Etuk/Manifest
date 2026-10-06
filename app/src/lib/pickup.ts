/**
 * Pickup proof: the ticket holder signs `manifest-pickup:<consignment>:<nonce>:<ts>` and
 * shows it as a QR code; the forwarder's scanner checks the signature, freshness and that
 * the signer currently holds the Cargo Ticket. Same checks run client-side and in
 * POST /api/pickup/verify.
 */
import {
  consignmentStatus,
  containerStatus,
  decodeFixed,
  findCargoTicketHolder,
  type ManifestProgram,
} from "@manifest/sdk";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { z } from "zod";

export const PICKUP_MAX_AGE_SECS = 10 * 60;

export const pickupPayloadSchema = z.object({
  v: z.literal(1),
  c: z.string().min(32).max(44),
  h: z.string().min(32).max(44),
  n: z.string().min(8).max(64),
  t: z.number().int().positive(),
  s: z.string().min(64).max(128),
});
export type PickupPayload = z.infer<typeof pickupPayloadSchema>;

export function pickupMessage(consignment: string, nonce: string, ts: number): Uint8Array {
  return new TextEncoder().encode(`manifest-pickup:${consignment}:${nonce}:${ts}`);
}

export async function createPickupPayload(
  consignment: PublicKey,
  holder: PublicKey,
  signMessage: (m: Uint8Array) => Promise<Uint8Array>,
): Promise<PickupPayload> {
  const nonce = bs58.encode(nacl.randomBytes(12));
  const ts = Math.floor(Date.now() / 1000);
  const signature = await signMessage(pickupMessage(consignment.toBase58(), nonce, ts));
  return {
    v: 1,
    c: consignment.toBase58(),
    h: holder.toBase58(),
    n: nonce,
    t: ts,
    s: bs58.encode(signature),
  };
}

export interface PickupCheck {
  ok: boolean;
  problems: string[];
  cartons: number;
  description: string;
  holder: string;
  freightFunded: boolean;
}

export async function verifyPickupPayload(
  program: ManifestProgram,
  raw: unknown,
  now = Math.floor(Date.now() / 1000),
): Promise<PickupCheck> {
  const parsed = pickupPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      problems: ["This isn't a Manifest pickup code."],
      cartons: 0,
      description: "",
      holder: "",
      freightFunded: false,
    };
  }
  const p = parsed.data;
  const problems: string[] = [];
  let holderKey: PublicKey;
  let consignmentKey: PublicKey;
  try {
    holderKey = new PublicKey(p.h);
    consignmentKey = new PublicKey(p.c);
  } catch {
    return {
      ok: false,
      problems: ["The code has an invalid address."],
      cartons: 0,
      description: "",
      holder: p.h,
      freightFunded: false,
    };
  }

  const validSig = nacl.sign.detached.verify(
    pickupMessage(p.c, p.n, p.t),
    bs58.decode(p.s),
    holderKey.toBytes(),
  );
  if (!validSig) problems.push("The signature doesn't match the holder.");
  if (now - p.t > PICKUP_MAX_AGE_SECS || p.t - now > 60)
    problems.push("The code has expired. Ask the holder to refresh it.");

  const c = await program.account.consignment.fetchNullable(consignmentKey);
  if (!c) {
    return {
      ok: false,
      problems: [...problems, "Shipment not found."],
      cartons: 0,
      description: "",
      holder: p.h,
      freightFunded: false,
    };
  }
  const k = await program.account.container.fetch(c.container);
  if (containerStatus(k) !== "arrived") problems.push("The container hasn't been marked arrived.");
  if (consignmentStatus(c) !== "approved") problems.push("This shipment isn't ready for pickup.");
  const freightFunded = BigInt(c.freightEscrowed.toString()) >= BigInt(c.freightDue.toString());
  if (!freightFunded) problems.push("Freight isn't fully paid yet.");
  const holder = await findCargoTicketHolder(program, c.cargoTicketMint, holderKey);
  if (!holder || !holder.owner.equals(holderKey))
    problems.push("This person doesn't hold the Cargo Ticket.");

  return {
    ok: problems.length === 0,
    problems,
    cartons: c.cartonCount,
    description: decodeFixed(c.description),
    holder: p.h,
    freightFunded,
  };
}
