"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { useToast } from "@/components/toasts";
import { config } from "@/lib/config";
import { useWallet } from "@/lib/wallet/context";

/**
 * Ask the server-side gas tank (POST /api/faucet) for test dollars + a little SOL.
 * A real devnet transaction; the toast links to it on Explorer. Not on mainnet.
 */
export function useFaucet() {
  const wallet = useWallet();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const available = config.cluster !== "mainnet-beta" && config.demoMint !== null;

  const request = useCallback(async (): Promise<boolean> => {
    if (!wallet.publicKey) {
      await wallet.connect();
      return false;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: wallet.publicKey.toBase58() }),
      });
      const data = (await res.json()) as { error?: string; explorer?: string; dollars?: number };
      if (!res.ok) {
        toast({ kind: "error", title: data.error ?? "The faucet couldn't send right now." });
        return false;
      }
      toast({
        kind: "success",
        title: `${data.dollars} test dollars sent`,
        body: "Plus a little SOL for network fees if you needed it.",
        href: data.explorer,
      });
      await queryClient.invalidateQueries();
      return true;
    } catch {
      toast({ kind: "error", title: "The faucet couldn't send right now." });
      return false;
    } finally {
      setBusy(false);
    }
  }, [wallet, toast, queryClient]);

  return { available, busy, request };
}
