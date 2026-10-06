"use client";

import { shortAddress } from "@manifest/sdk";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useFaucet } from "@/hooks/use-faucet";
import { config } from "@/lib/config";
import { useWallet } from "@/lib/wallet/context";

import { LogoMark } from "./logo";
import { Button } from "./ui";

export function WalletButton() {
  const wallet = useWallet();
  if (!wallet.ready) return <span className="text-sm text-ink-muted">…</span>;
  if (!wallet.publicKey) {
    return (
      <Button
        variant="secondary"
        onClick={wallet.connect}
        className="min-h-10 whitespace-nowrap px-3 text-sm"
      >
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

const NAV = [
  { href: "/containers", label: "Containers" },
  { href: "/me", label: "My shipments" },
  { href: "/forwarder", label: "Forwarders" },
  { href: "/verify", label: "Verify" },
] as const;

function NavLink({ href, label, className }: { href: string; label: string; className: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${className} ${active ? "font-semibold underline decoration-accent decoration-2 underline-offset-4" : ""}`}
    >
      {label}
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b-2 border-rule">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 font-stencil text-2xl uppercase tracking-wide"
        >
          <LogoMark className="size-8 shrink-0" />
          Manifest
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-3 sm:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.href}
              {...n}
              className="whitespace-nowrap rounded-lg px-2 py-2 hover:bg-paper-raised"
            />
          ))}
        </nav>
        <WalletButton />
      </div>
      {/* Phones: the same links on their own row, so nothing is hidden behind a menu. */}
      <nav aria-label="Main" className="border-t border-rule sm:hidden">
        <div className="mx-auto flex max-w-5xl justify-between px-2">
          {NAV.map((n) => (
            <NavLink
              key={n.href}
              {...n}
              className="flex min-h-11 items-center whitespace-nowrap px-2 text-sm"
            />
          ))}
        </div>
      </nav>
    </header>
  );
}

export function DevnetBanner() {
  const wallet = useWallet();
  const faucet = useFaucet();
  if (config.cluster === "mainnet-beta") return null;

  return (
    <div className="bg-ink text-paper">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
        <p>
          You&apos;re on the Manifest demo network ({config.cluster}). Money here is test money with
          no real value.
        </p>
        {faucet.available && (
          <button
            type="button"
            onClick={() => void faucet.request()}
            disabled={faucet.busy}
            className="min-h-9 whitespace-nowrap rounded-lg border-2 border-paper px-3 font-medium hover:bg-paper hover:text-ink disabled:opacity-60"
          >
            {faucet.busy
              ? "Sending…"
              : wallet.publicKey
                ? "Get test dollars"
                : "Connect for test dollars"}
          </button>
        )}
      </div>
    </div>
  );
}
