"use client";

import { shortAddress } from "@manifest/sdk";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { config } from "@/lib/config";
import { useWallet } from "@/lib/wallet/context";

import { useToast } from "./toasts";
import { Button } from "./ui";

export function WalletButton() {
  const wallet = useWallet();
  if (!wallet.ready) return <span className="text-sm text-ink-muted">…</span>;
  if (!wallet.publicKey) {
    return (
      <Button variant="secondary" onClick={wallet.connect} className="min-h-10 px-3 text-sm">
        {config.burnerWallet ? "Test wallet" : config.phantomAppId ? "Sign in" : "Connect"}
      </Button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void wallet.disconnect()}
      className="min-h-10 rounded-lg border-2 border-rule px-3 font-mono text-sm hover:border-ink"
      title="Disconnect"
    >
      {shortAddress(wallet.publicKey.toBase58())}
    </button>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b-2 border-rule">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="font-stencil text-2xl uppercase tracking-wide">
          Manifest
        </Link>
        <nav className="flex items-center gap-1 sm:gap-3">
          <Link
            href="/containers"
            className="hidden rounded-lg px-2 py-2 hover:bg-paper-raised sm:inline"
          >
            Containers
          </Link>
          <Link
            href="/me"
            className="whitespace-nowrap rounded-lg px-2 py-2 text-sm hover:bg-paper-raised sm:text-base"
          >
            My shipments
          </Link>
          <Link
            href="/forwarder"
            className="hidden rounded-lg px-2 py-2 hover:bg-paper-raised sm:inline"
          >
            Forwarders
          </Link>
          <WalletButton />
        </nav>
      </div>
    </header>
  );
}

export function DevnetBanner() {
  const wallet = useWallet();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (config.cluster === "mainnet-beta") return null;

  // Real devnet transaction from the server-side gas tank (app/src/app/api/faucet).
  async function getTestDollars() {
    if (!wallet.publicKey) {
      await wallet.connect();
      return;
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
        return;
      }
      toast({
        kind: "success",
        title: `${data.dollars} test dollars sent`,
        body: "Plus a little SOL for fees if you needed it.",
        href: data.explorer,
      });
      await queryClient.invalidateQueries();
    } catch {
      toast({ kind: "error", title: "The faucet couldn't send right now." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-ink text-paper">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
        <p>
          You&apos;re on the Manifest demo network ({config.cluster}). Money here is test money with
          no real value.
        </p>
        {config.demoMint && (
          <button
            type="button"
            onClick={() => void getTestDollars()}
            disabled={busy}
            className="min-h-9 whitespace-nowrap rounded-lg border-2 border-paper px-3 font-medium hover:bg-paper hover:text-ink disabled:opacity-60"
          >
            {busy ? "Sending…" : wallet.publicKey ? "Get test dollars" : "Connect for test dollars"}
          </button>
        )}
      </div>
    </div>
  );
}
