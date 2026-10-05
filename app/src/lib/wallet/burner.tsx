"use client";

/**
 * Localnet-only test wallet: a keypair kept in this browser's localStorage. It signs and
 * sends real transactions to the local validator; it exists so the full app can be
 * exercised in automated browser tests without a wallet extension. Never enabled on
 * devnet or mainnet (see config.burnerWallet).
 */
import { Keypair, type VersionedTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getConnection } from "../chain";
import type { ManifestWallet, WalletHostProps } from "./types";

const KEY = "manifest.burner";

function load(): Keypair | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[])) : null;
  } catch {
    return null;
  }
}

export default function BurnerWallet({ onChange }: WalletHostProps) {
  // Mounted client-side only (next/dynamic with ssr: false), so localStorage is available.
  const [keypair, setKeypair] = useState<Keypair | null>(() => load());
  const ready = true;

  const connect = useCallback(() => {
    const kp = load() ?? Keypair.generate();
    try {
      window.localStorage.setItem(KEY, JSON.stringify(Array.from(kp.secretKey)));
    } catch {
      // Storage unavailable: the wallet lasts for this page view only.
    }
    setKeypair(kp);
  }, []);

  const value = useMemo<ManifestWallet>(
    () => ({
      kind: keypair ? "burner" : null,
      publicKey: keypair?.publicKey ?? null,
      ready,
      connecting: false,
      embedded: false,
      spendingLimitHit: false,
      connect,
      disconnect: async () => {
        try {
          window.localStorage.removeItem(KEY);
        } catch {
          // ignore
        }
        setKeypair(null);
      },
      signAndSend: async (tx: VersionedTransaction) => {
        if (!keypair) throw new Error("Connect a wallet first");
        tx.sign([keypair]);
        return getConnection().sendTransaction(tx, { maxRetries: 3 });
      },
      signMessage: async (message: Uint8Array) => {
        if (!keypair) throw new Error("Connect a wallet first");
        return nacl.sign.detached(message, keypair.secretKey);
      },
    }),
    [keypair, ready, connect],
  );

  useEffect(() => onChange(value), [value, onChange]);
  return null;
}
