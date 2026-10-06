"use client";

/**
 * Phantom Connect (https://docs.phantom.com/sdks/react-sdk).
 * - With NEXT_PUBLIC_PHANTOM_APP_ID: Google / Apple embedded wallets + the extension.
 * - Without it: the Phantom extension or app only ("injected" needs no App ID).
 * Embedded wallets support only signAndSendTransaction (no sign-only), so every action
 * is a single transaction.
 */
import {
  AddressType,
  type PhantomTheme,
  PhantomProvider,
  type PhantomProviderProps,
  useDisconnect,
  useModal,
  usePhantom,
  useSolana,
} from "@phantom/react-sdk";
import { PublicKey, type VersionedTransaction } from "@solana/web3.js";
import { useEffect, useMemo, useRef } from "react";

import { config } from "../config";
import type { ManifestWallet, WalletHostProps } from "./types";

const theme: PhantomTheme = {
  background: "#fffdf8",
  text: "#14213d",
  secondary: "#4a5470",
  brand: "#c2410c",
  error: "#b42318",
  success: "#28724a",
  borderRadius: "12px",
  overlay: "rgba(20, 33, 61, 0.6)",
};

function PhantomBridge({ onChange }: WalletHostProps) {
  const { isConnected, isLoading, isConnecting, addresses, errors, user } = usePhantom();
  const { open } = useModal();
  const { disconnect } = useDisconnect();
  // useSolana() returns a new object on every render. Depending on it rebuilt the wallet
  // value each render, which re-rendered the host and looped ("Maximum update depth").
  // Keep the latest one in a ref and call through it.
  const { solana } = useSolana();
  const solanaRef = useRef(solana);
  useEffect(() => {
    solanaRef.current = solana;
  });

  const address = addresses.find((a) => a.addressType === AddressType.solana)?.address;
  // Social-login (embedded) wallets vs the user's own extension/app.
  const embedded = ["google", "apple", "phantom", "device"].includes(user?.authProvider ?? "");

  // Embedded wallets broadcast through Phantom; point them at our cluster.
  useEffect(() => {
    if (isConnected && embedded && config.cluster === "devnet") {
      solanaRef.current.switchNetwork("devnet").catch(() => undefined);
    }
  }, [isConnected, embedded]);

  const value = useMemo<ManifestWallet>(
    () => ({
      kind: isConnected ? "phantom" : null,
      publicKey: isConnected && address ? new PublicKey(address) : null,
      ready: !isLoading,
      connecting: isConnecting,
      embedded,
      spendingLimitHit: Boolean(errors.spendingLimit),
      connect: () => {
        // Social login leaves the page; remember where to come back to.
        try {
          window.sessionStorage.setItem("manifest.returnTo", window.location.pathname);
        } catch {
          // storage unavailable
        }
        open();
      },
      disconnect,
      signAndSend: async (tx: VersionedTransaction) =>
        (await solanaRef.current.signAndSendTransaction(tx)).signature,
      // Extension/app wallets can sign without sending; embedded (social) wallets can't.
      signTransaction: embedded
        ? undefined
        : async (tx: VersionedTransaction) =>
            (await solanaRef.current.signTransaction(tx)) as VersionedTransaction,
      signMessage: async (message: Uint8Array) =>
        (await solanaRef.current.signMessage(message)).signature,
    }),
    [
      isConnected,
      address,
      isLoading,
      isConnecting,
      embedded,
      errors.spendingLimit,
      open,
      disconnect,
    ],
  );

  useEffect(() => onChange(value), [value, onChange]);
  return null;
}

const withAppId = Boolean(config.phantomAppId);
// Module-level: the provider gets the same config object on every render.
const phantomConfig = {
  providers: withAppId ? ["google", "apple", "injected"] : ["injected"],
  appId: config.phantomAppId || undefined,
  addressTypes: [AddressType.solana],
  authOptions: withAppId ? { redirectUrl: `${config.appUrl}/auth/callback` } : undefined,
} satisfies PhantomProviderProps["config"];

/** Mounted lazily next to the app (not around it) so pages still render on the server. */
export default function PhantomWallet({ onChange }: WalletHostProps) {
  return (
    <PhantomProvider
      config={phantomConfig}
      theme={theme}
      appName="Manifest"
      appIcon={`${config.appUrl}/icon.svg`}
    >
      <PhantomBridge onChange={onChange} />
    </PhantomProvider>
  );
}
