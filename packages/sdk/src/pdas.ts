/** Every program-derived address from spec section 5.2. */
import { PublicKey } from "@solana/web3.js";

import { MANIFEST_PROGRAM_ID, SEEDS } from "./constants.js";

const enc = (s: string) => new TextEncoder().encode(s);

function find(seeds: Uint8Array[], programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

function u16le(n: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}

export const configPda = (programId = MANIFEST_PROGRAM_ID) => find([enc(SEEDS.config)], programId);

export const forwarderPda = (authority: PublicKey, programId = MANIFEST_PROGRAM_ID) =>
  find([enc(SEEDS.forwarder), authority.toBytes()], programId);

export const bondVaultPda = (forwarder: PublicKey, programId = MANIFEST_PROGRAM_ID) =>
  find([enc(SEEDS.bondVault), forwarder.toBytes()], programId);

export const containerPda = (
  forwarder: PublicKey,
  index: number,
  programId = MANIFEST_PROGRAM_ID,
) => find([enc(SEEDS.container), forwarder.toBytes(), u32le(index)], programId);

export const consignmentPda = (
  container: PublicKey,
  index: number,
  programId = MANIFEST_PROGRAM_ID,
) => find([enc(SEEDS.consignment), container.toBytes(), u16le(index)], programId);

export const vaultPda = (consignment: PublicKey, programId = MANIFEST_PROGRAM_ID) =>
  find([enc(SEEDS.vault), consignment.toBytes()], programId);

export const cargoTicketPda = (consignment: PublicKey, programId = MANIFEST_PROGRAM_ID) =>
  find([enc(SEEDS.cargoTicket), consignment.toBytes()], programId);

export const ticketAuthorityPda = (programId = MANIFEST_PROGRAM_ID) =>
  find([enc(SEEDS.ticketAuthority)], programId);
