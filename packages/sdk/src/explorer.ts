import type { Cluster } from "./constants.js";

export type ExplorerKind = "address" | "tx";

/**
 * Link to Solana Explorer for an address or transaction signature.
 * Localnet links point the explorer at a local validator RPC.
 */
export function explorerUrl(kind: ExplorerKind, value: string, cluster: Cluster): string {
  const base = `https://explorer.solana.com/${kind}/${value}`;
  switch (cluster) {
    case "mainnet-beta":
      return base;
    case "devnet":
      return `${base}?cluster=devnet`;
    case "localnet":
      return `${base}?cluster=custom&customUrl=${encodeURIComponent("http://localhost:8899")}`;
  }
}
