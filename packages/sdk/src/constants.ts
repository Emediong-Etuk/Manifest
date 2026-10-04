/**
 * Cluster configuration shared by the app, scripts and tests.
 *
 * The program ID and mint addresses are NOT hard-coded here: they come from the
 * Anchor IDL (copied in at build time from Phase 2) or from environment
 * variables, so the SDK never invents addresses.
 */

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
