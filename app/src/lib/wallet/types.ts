import type { PublicKey, VersionedTransaction } from "@solana/web3.js";

export type WalletKind = "phantom" | "burner";

/** The one wallet interface the app uses, whatever is behind it. */
export interface ManifestWallet {
  kind: WalletKind | null;
  publicKey: PublicKey | null;
  ready: boolean;
  connecting: boolean;
  /** Embedded Phantom wallets have a per-app daily spending limit. */
  embedded: boolean;
  spendingLimitHit: boolean;
  connect: () => void;
  disconnect: () => Promise<void>;
  /** Sign and broadcast. Embedded wallets only support this combined call. */
  signAndSend: (tx: VersionedTransaction) => Promise<string>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}

export const DISCONNECTED: ManifestWallet = {
  kind: null,
  publicKey: null,
  ready: false,
  connecting: false,
  embedded: false,
  spendingLimitHit: false,
  connect: () => undefined,
  disconnect: async () => undefined,
  signAndSend: async () => {
    throw new Error("Connect a wallet first");
  },
  signMessage: async () => {
    throw new Error("Connect a wallet first");
  },
};

/** Wallet implementations are mounted as hosts that report their state upward. */
export interface WalletHostProps {
  onChange: (wallet: ManifestWallet) => void;
}
