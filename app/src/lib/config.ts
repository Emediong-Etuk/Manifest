/**
 * Public runtime configuration. `process.env.NEXT_PUBLIC_*` must be read with literal
 * property names so Next.js can inline them at build time.
 */
import { defaultRpcUrl, parseCluster, resolveProgramId } from "@manifest/sdk";
import { PublicKey } from "@solana/web3.js";

const cluster = parseCluster(process.env.NEXT_PUBLIC_CLUSTER);

function optionalKey(value: string | undefined): PublicKey | null {
  if (!value) return null;
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

export const config = {
  cluster,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || defaultRpcUrl(cluster),
  programId: resolveProgramId(process.env.NEXT_PUBLIC_PROGRAM_ID || undefined),
  appUrl: (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  phantomAppId: process.env.NEXT_PUBLIC_PHANTOM_APP_ID || "",
  demoMint: optionalKey(process.env.NEXT_PUBLIC_DEMO_MINT),
  usdcMint: optionalKey(process.env.NEXT_PUBLIC_USDC_MINT),
  /** Squads v4 arbitration multisig and its vault (index 0), from scripts/squads-setup. */
  squadsMultisig: optionalKey(process.env.NEXT_PUBLIC_SQUADS_MULTISIG),
  squadsVault: optionalKey(process.env.NEXT_PUBLIC_SQUADS_VAULT),
  /**
   * Local test wallet (keypair in this browser). Only on localnet, for development and
   * automated browser tests; devnet and mainnet always use Phantom.
   */
  burnerWallet: cluster === "localnet",
} as const;

export const isDevnet = config.cluster === "devnet";
