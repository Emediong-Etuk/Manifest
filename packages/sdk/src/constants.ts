/**
 * Cluster configuration and program constants shared by the app, scripts and tests.
 *
 * The program ID comes from the Anchor IDL (synced from the build) and can be
 * overridden from the environment; mint addresses always come from the environment or
 * the onchain config. The SDK never invents addresses.
 */
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

import { IDL } from "./idl/idl.js";

export const CLUSTERS = ["devnet", "localnet", "mainnet-beta"] as const;
export type Cluster = (typeof CLUSTERS)[number];

export function isCluster(value: string): value is Cluster {
  return (CLUSTERS as readonly string[]).includes(value);
}

/** Parse a cluster name (e.g. from NEXT_PUBLIC_CLUSTER), defaulting to devnet. */
export function parseCluster(value: string | undefined): Cluster {
  if (value === undefined || value === "") return "devnet";
  if (!isCluster(value)) {
    throw new Error(`Unknown cluster "${value}". Expected one of: ${CLUSTERS.join(", ")}`);
  }
  return value;
}

/** Public RPC fallback when no NEXT_PUBLIC_RPC_URL is configured. */
export function defaultRpcUrl(cluster: Cluster): string {
  switch (cluster) {
    case "devnet":
      return "https://api.devnet.solana.com";
    case "localnet":
      return "http://127.0.0.1:8899";
    case "mainnet-beta":
      return "https://api.mainnet-beta.solana.com";
  }
}

/** Program ID from the synced IDL. */
export const MANIFEST_PROGRAM_ID = new PublicKey(IDL.address);

/** Program ID from an env value (e.g. NEXT_PUBLIC_PROGRAM_ID), falling back to the IDL. */
export function resolveProgramId(value?: string): PublicKey {
  return value ? new PublicKey(value) : MANIFEST_PROGRAM_ID;
}

/** PDA seeds; must match programs/manifest/src/constants.rs. */
export const SEEDS = {
  config: "config",
  forwarder: "forwarder",
  bondVault: "bond_vault",
  container: "container",
  consignment: "consignment",
  vault: "vault",
  cargoTicket: "cargo_ticket",
  ticketAuthority: "ticket_authority",
} as const;

export { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID };

/** Payment and bond mints are 6-decimal USD stablecoins. */
export const USD_DECIMALS = 6;
export const USD = 1_000_000n;

/** Fixed-size text fields (bytes). */
export const FIELD_LEN = {
  name: 32,
  code: 12,
  locode: 5,
  description: 64,
  containerNumber: 11,
  metadataBaseUri: 96,
} as const;

/** Dispute reason codes stored onchain (`Consignment.dispute_reason`). */
export const DISPUTE_REASONS = {
  1: "Wrong goods",
  2: "Short quantity",
  3: "Missing cartons",
  4: "Damaged goods",
  5: "Container overdue",
  6: "Other",
} as const;
export type DisputeReason = keyof typeof DISPUTE_REASONS;

/** Compute-unit limit added to the heavy transactions (approval mints a Token-2022 NFT). */
export const HEAVY_TX_COMPUTE_UNITS = 400_000;
