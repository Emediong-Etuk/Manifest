/**
 * Shared pieces for the demo scripts (seed-demo, fund-wallet, demo-reset): the demo cast
 * (stable keypairs in .keys/, gitignored), SOL + test-dollar funding, and evidence upload
 * through the app's real POST /api/evidence (signed by the forwarder, like the UI does).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  type ContainerAccount,
  decodeFixed,
  evidenceFieldsHash,
  evidenceMessage,
  fromHex,
  getConfig,
  iso6346CheckDigit,
  ix,
  listContainers,
  nextConsignmentAddressFor,
  sha256,
  toHex,
} from "@manifest/sdk";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { type Keypair, LAMPORTS_PER_SOL, type PublicKey, SystemProgram } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

import { type Chain, send } from "./chain.js";
import { REPO_ROOT } from "./env.js";
import { devKeypair, keypairFromEnv } from "./keys.js";
import { demoKeypair } from "./squads.js";

export const USD = 1_000_000n;
export const DAY = 86_400;
export const now = () => Math.floor(Date.now() / 1000);

export const cast = () => ({
  eastline: demoKeypair("demo-forwarder-eastline"),
  harbour: demoKeypair("demo-forwarder-harbour"),
  ada: demoKeypair("demo-trader-ada"),
  bayo: demoKeypair("demo-trader-bayo"),
  chika: demoKeypair("demo-trader-chika"),
  buyer: demoKeypair("demo-buyer-dele"),
  supplierA: demoKeypair("demo-supplier-guangzhou").publicKey,
  supplierB: demoKeypair("demo-supplier-yiwu").publicKey,
});

/** The demo payment mint: config.payment_mints[0] (the test dollar, mUSD). */
export async function demoMint(c: Chain): Promise<PublicKey> {
  const config = await getConfig(c.program);
  const mint = config?.paymentMints[0];
  if (!mint) throw new Error("Config not initialized. Run init-config (or seed:local) first.");
  return mint;
}

/** Whichever local key is the mint authority: GAS_TANK_SECRET_KEY on devnet, dev key locally. */
export async function mintAuthority(c: Chain, mint: PublicKey): Promise<Keypair> {
  const info = await getMint(c.connection, mint, "confirmed", TOKEN_PROGRAM_ID);
  const candidates = [
    devKeypair(),
    ...(process.env.GAS_TANK_SECRET_KEY ? [keypairFromEnv("GAS_TANK_SECRET_KEY")] : []),
  ];
  const match = candidates.find((k) => info.mintAuthority?.equals(k.publicKey));
  if (!match)
    throw new Error("Neither the dev key nor GAS_TANK_SECRET_KEY is the demo mint authority.");
  return match;
}

/** Top `owner` up to `sol` SOL (airdrop on localnet, transfer from the dev key elsewhere). */
export async function ensureSol(c: Chain, owner: PublicKey, sol: number): Promise<void> {
  const want = Math.round(sol * LAMPORTS_PER_SOL);
  const have = await c.connection.getBalance(owner);
  if (have >= want) return;
  if (c.cluster === "localnet") {
    const sig = await c.connection.requestAirdrop(owner, want - have);
    await c.connection.confirmTransaction(sig, "confirmed");
    return;
  }
  const admin = devKeypair();
  await send(
    c,
    `fund ${owner.toBase58().slice(0, 4)}… with ${((want - have) / LAMPORTS_PER_SOL).toFixed(3)} SOL`,
    [
      SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: owner,
        lamports: want - have,
      }),
    ],
    [admin],
  );
}

/** Top `owner` up to `dollars` test dollars by minting the difference. */
export async function ensureDollars(
  c: Chain,
  mint: PublicKey,
  authority: Keypair,
  owner: PublicKey,
  dollars: bigint,
): Promise<void> {
  const ataAddr = getAssociatedTokenAddressSync(mint, owner, true, TOKEN_PROGRAM_ID);
  const have = await c.connection
    .getTokenAccountBalance(ataAddr)
    .then((r) => BigInt(r.value.amount))
    .catch(() => 0n);
  const want = dollars * USD;
  if (have >= want) return;
  await send(
    c,
    `mint ${(want - have) / USD} test dollars to ${owner.toBase58().slice(0, 4)}…`,
    [
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, ataAddr, owner, mint),
      createMintToInstruction(mint, ataAddr, authority.publicKey, want - have),
    ],
    [authority],
  );
}

/** Find a forwarder's container by its human code (e.g. LAG-1014). */
export async function findContainer(
  c: Chain,
  forwarderPdaAddress: PublicKey,
  code: string,
): Promise<{ address: PublicKey; account: ContainerAccount } | null> {
  const all = await listContainers(c.program, { forwarder: forwarderPdaAddress });
  return all.find((k) => decodeFixed(k.account.code) === code) ?? null;
}

/** A valid ISO 6346 container number for `owner` (3 letters) + serial. */
export function containerNumber(owner: string, serial: number): string {
  const first10 = `${owner}U${String(serial).padStart(6, "0")}`;
  const digit = iso6346CheckDigit(first10);
  if (digit === null) throw new Error(`Bad container number prefix ${first10}`);
  return `${first10}${digit}`;
}

export interface Booking {
  trader: Keypair;
  goods: bigint;
  estCbmMilli: number;
  payee: PublicKey;
  description: string;
  evidence?: EvidenceInput;
}

export async function openContainer(
  c: Chain,
  mint: PublicKey,
  fwd: Keypair,
  code: string,
  route: [string, string],
  rate: bigint,
  cutoffIn: number,
  etaIn: number,
  capacityCbmMilli = 28_000,
): Promise<PublicKey> {
  const address = await ix.nextContainerAddress(c.program, fwd.publicKey);
  await send(
    c,
    `open_container ${code}`,
    await ix.openContainer(c.program, {
      authority: fwd.publicKey,
      code,
      origin: route[0],
      destination: route[1],
      mode: "sea",
      mint,
      capacityCbmMilli,
      ratePerCbm: rate * USD,
      cutoffTs: now() + cutoffIn,
      etaTs: now() + etaIn,
    }),
    [fwd],
  );
  return address;
}

/** Book, and if evidence is given, upload it and record the receipt. */
export async function book(
  c: Chain,
  fwd: Keypair,
  container: PublicKey,
  b: Booking,
): Promise<PublicKey> {
  const k = await nextConsignmentAddressFor(c.program, container);
  await send(
    c,
    `book "${b.description}"`,
    await ix.bookConsignment(c.program, {
      trader: b.trader.publicKey,
      container,
      goodsAmount: b.goods * USD,
      estCbmMilli: b.estCbmMilli,
      payee: b.payee,
      description: b.description,
    }),
    [b.trader],
  );
  if (b.evidence) {
    const hash = await uploadEvidence(fwd, k, b.evidence);
    await send(
      c,
      "record_receipt",
      await ix.recordReceipt(c.program, {
        authority: fwd.publicKey,
        consignment: k,
        evidenceHash: hash,
        measuredCbmMilli: b.evidence.measuredCbmMilli,
        cartonCount: b.evidence.cartonCount,
      }),
      [fwd],
    );
  }
  return k;
}

export const approve = async (c: Chain, trader: Keypair, k: PublicKey) =>
  send(
    c,
    "approve_goods",
    await ix.approveGoods(c.program, { trader: trader.publicKey, consignment: k }),
    [trader],
  );

/** Close, load and arrive a container, skipping the steps it has already done (resumable). */
export async function voyage(
  c: Chain,
  fwd: Keypair,
  container: PublicKey,
  code: string,
  serial: number,
) {
  const status = async () =>
    Object.keys((await c.program.account.container.fetch(container)).status)[0];
  if ((await status()) === "open")
    await send(
      c,
      `close_booking ${code}`,
      await ix.closeBooking(c.program, { caller: fwd.publicKey, container }),
      [fwd],
    );
  if ((await status()) === "closed")
    await send(
      c,
      `mark_loaded ${code}`,
      await ix.markLoaded(c.program, {
        authority: fwd.publicKey,
        container,
        containerNumber: containerNumber("MSC", serial),
        blHash: await sha256(`demo bill of lading ${code}`),
      }),
      [fwd],
    );
  if ((await status()) === "loaded")
    await send(
      c,
      `mark_arrived ${code}`,
      await ix.markArrived(c.program, { authority: fwd.publicKey, container }),
      [fwd],
    );
}

export const ev = (
  cartonCount: number,
  measuredCbmMilli: number,
  item: string,
  qty: number,
  photos: string[],
  notes = "",
): EvidenceInput => ({
  cartonCount,
  measuredCbmMilli,
  packingList: [{ item, qty }],
  notes,
  photos,
});

/**
 * The three LAG-1014 shipments: phone cases (approved), speakers (received, waiting for the
 * trader's review) and fabric (booked, waiting for the goods).
 */
export async function stagedShipments(
  c: Chain,
  who: ReturnType<typeof cast>,
  container: PublicKey,
): Promise<void> {
  const phone = await book(c, who.eastline, container, {
    trader: who.ada,
    goods: 2_400n,
    estCbmMilli: 1_250,
    payee: who.supplierA,
    description: "Phone cases, 12 cartons",
    evidence: ev(12, 1_080, "Phone cases", 2_400, [
      "cartons-stack.jpg",
      "carton-measure.jpg",
      "warehouse-label.jpg",
    ]),
  });
  await approve(c, who.ada, phone);
  await book(c, who.eastline, container, {
    trader: who.bayo,
    goods: 1_800n,
    estCbmMilli: 900,
    payee: who.supplierA,
    description: "Bluetooth speakers, 8 cartons",
    evidence: ev(
      8,
      860,
      "Bluetooth speakers",
      320,
      ["pallet-wrapped.jpg", "carton-measure.jpg"],
      "Two cartons re-taped at the warehouse.",
    ),
  });
  await book(c, who.eastline, container, {
    trader: who.chika,
    goods: 3_000n,
    estCbmMilli: 2_000,
    payee: who.supplierB,
    description: "Ankara fabric, 20 rolls",
  });
}

export const appUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

const ASSETS = resolve(REPO_ROOT, "scripts/demo-assets");

export interface EvidenceInput {
  measuredCbmMilli: number;
  cartonCount: number;
  packingList: { item: string; qty: number }[];
  notes: string;
  photos: string[]; // file names in scripts/demo-assets
}

/**
 * Upload receipt evidence through the app exactly like the forwarder UI: sign
 * `manifest-evidence:<consignment>:<fields hash>:<ts>`, POST multipart, get back the
 * manifest hash that record_receipt stores onchain. Needs the app running at APP_URL.
 */
export async function uploadEvidence(
  forwarder: Keypair,
  consignment: PublicKey,
  e: EvidenceInput,
): Promise<Uint8Array> {
  const files = e.photos.map((name) => new Uint8Array(readFileSync(resolve(ASSETS, name))));
  const photoHashes = await Promise.all(files.map(async (b) => toHex(await sha256(b))));
  const ts = Math.floor(Date.now() / 1000);
  const fieldsHash = await evidenceFieldsHash({
    consignment: consignment.toBase58(),
    measuredCbmMilli: e.measuredCbmMilli,
    cartonCount: e.cartonCount,
    packingList: e.packingList,
    notes: e.notes,
    photoHashes,
  });
  const signature = nacl.sign.detached(
    evidenceMessage(consignment.toBase58(), fieldsHash, ts),
    forwarder.secretKey,
  );
  const form = new FormData();
  form.set("consignment", consignment.toBase58());
  form.set("measuredCbmMilli", String(e.measuredCbmMilli));
  form.set("cartonCount", String(e.cartonCount));
  form.set("packingList", JSON.stringify(e.packingList));
  form.set("notes", e.notes);
  form.set("signer", forwarder.publicKey.toBase58());
  form.set("ts", String(ts));
  form.set("signature", bs58.encode(signature));
  files.forEach((bytes, i) =>
    form.append("photos", new Blob([bytes], { type: "image/jpeg" }), e.photos[i]),
  );
  let res: Response;
  try {
    res = await fetch(`${appUrl()}/api/evidence`, { method: "POST", body: form });
  } catch {
    throw new Error(
      `Couldn't reach ${appUrl()}/api/evidence. Start the app (pnpm --filter @manifest/app dev) or set NEXT_PUBLIC_APP_URL.`,
    );
  }
  const body = (await res.json()) as { manifestHashHex?: string; error?: string };
  if (!res.ok || !body.manifestHashHex) {
    throw new Error(`Evidence upload failed (${res.status}): ${body.error ?? "unknown"}`);
  }
  console.log(
    `  evidence stored (${e.photos.length} photos), hash ${body.manifestHashHex.slice(0, 12)}…`,
  );
  return fromHex(body.manifestHashHex);
}
