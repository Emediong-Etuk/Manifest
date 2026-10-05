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
  if (config.cluster === "mainnet-beta") return null;
  return (
    <div className="bg-ink text-paper">
      <p className="mx-auto max-w-5xl px-4 py-2 text-sm">
        You&apos;re on the Manifest demo network ({config.cluster}). Money here is test money with
        no real value.
      </p>
    </div>
  );
}
