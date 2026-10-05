"use client";

import { consignmentStatus, decodeFixed, shortAddress } from "@manifest/sdk";
import Image from "next/image";
import Link from "next/link";

import { RouteLine } from "@/components/manifest";
import { Button, Card } from "@/components/ui";
import { useConsignments, useContainers, useNow, useTokenBalance } from "@/hooks/queries";
import { useFaucet } from "@/hooks/use-faucet";
import { config } from "@/lib/config";
import { formatUsdShort } from "@/lib/display";
import { useWallet } from "@/lib/wallet/context";

const STEPS = [
  {
    title: "Book space, lock your money",
    body: "Pick a bonded forwarder's shared container. Your goods payment and freight are locked safely in Manifest, not sent to an agent.",
  },
  {
    title: "See your goods before you pay",
    body: "The forwarder photographs and measures your cartons at the China warehouse. Your supplier is paid only when you approve.",
  },
  {
    title: "Collect in Lagos with your Cargo Ticket",
    body: "Show your Cargo Ticket at the warehouse. Freight is released when you pick up. You can even sell the ticket while the goods are at sea.",
  },
];

function LiveStats() {
  const containers = useContainers();
  const consignments = useConsignments({});
  const all = consignments.data ?? [];
  const secured = all
    .filter((c) =>
      ["booked", "received", "approved", "disputed"].includes(consignmentStatus(c.account)),
    )
    .reduce((sum, c) => sum + BigInt(c.account.goodsAmount.toString()), 0n);
  const delivered = all.filter((c) => consignmentStatus(c.account) === "delivered").length;
  const loading = containers.isLoading || consignments.isLoading;
  const stats: [string, string][] = [
    ["Containers", loading ? "…" : String(containers.data?.length ?? 0)],
    ["Goods in active shipments", loading ? "…" : formatUsdShort(secured)],
    ["Shipments delivered", loading ? "…" : String(delivered)],
  ];
  return (
    <dl className="grid grid-cols-3 gap-2 sm:gap-3">
      {stats.map(([label, value]) => (
        <div
          key={label}
          className="flex flex-col-reverse justify-end rounded-xl border-2 border-rule bg-paper-raised p-3 sm:p-4"
        >
          <dt className="text-xs text-ink-muted sm:text-sm">{label}</dt>
          <dd className="font-stencil text-2xl sm:text-3xl">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The open container with space whose cut-off is soonest: the one to try first. */
function useTryContainer() {
  const open = useContainers({ status: "open" });
  const now = useNow();
  return (open.data ?? [])
    .filter(
      (k) =>
        k.account.cutoffTs.toNumber() > now &&
        k.account.capacityCbmMilli - k.account.bookedCbmMilli >= 500,
    )
    .sort((a, b) => a.account.cutoffTs.toNumber() - b.account.cutoffTs.toNumber())[0];
}

/** Demo networks only: sign in → test dollars → book, each step a real transaction. */
function TryItCard() {
  const wallet = useWallet();
  const faucet = useFaucet();
  const balance = useTokenBalance(wallet.publicKey, config.demoMint);
  const target = useTryContainer();
  const funded = (balance.data ?? 0n) > 0n;
  const done = "font-semibold text-stamp";

  return (
    <Card className="border-accent">
      <h2 className="text-xl font-semibold">Try it in 2 minutes</h2>
      <p className="mb-3 text-sm text-ink-muted">Free test money on the Solana {config.cluster}.</p>
      <ol className="flex flex-col gap-3">
        <li className="flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong>1.</strong> Sign in
          </span>
          {wallet.publicKey ? (
            <span className={done}>✓ {shortAddress(wallet.publicKey.toBase58())}</span>
          ) : (
            <Button className="min-h-10 px-4 text-sm" onClick={() => void wallet.connect()}>
              {config.burnerWallet ? "Create a test wallet" : "Sign in"}
            </Button>
          )}
        </li>
        <li className="flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong>2.</strong> Get test dollars
          </span>
          {funded ? (
            <span className={done}>✓ {formatUsdShort(balance.data ?? 0n)}</span>
          ) : (
            <Button
              className="min-h-10 px-4 text-sm"
              variant={wallet.publicKey ? "primary" : "secondary"}
              disabled={!wallet.publicKey || faucet.busy || !faucet.available}
              onClick={() => void faucet.request()}
            >
              {faucet.busy ? "Sending…" : "Get 500 test dollars"}
            </Button>
          )}
        </li>
        <li className="flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong>3.</strong> Book space
          </span>
          {target && funded ? (
            <Link
              href={`/book/${target.address.toBase58()}`}
              className="inline-flex min-h-10 items-center rounded-lg border-2 border-accent bg-accent px-4 text-sm font-semibold text-accent-ink"
            >
              Book on {decodeFixed(target.account.code)}
            </Link>
          ) : (
            <span className="text-sm text-ink-muted">
              {target ? `on ${decodeFixed(target.account.code)}` : "no open container yet"}
            </span>
          )}
        </li>
      </ol>
      <p className="mt-3 text-sm text-ink-muted">
        Tip: $300 of goods and 0.25 CBM fits inside 500 test dollars, freight included.
      </p>
    </Card>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-10">
      <section className="grid items-center gap-8 sm:grid-cols-2">
        <div className="flex flex-col gap-5">
          <RouteLine origin="CNCAN" destination="NGAPP" large />
          <h1 className="font-stencil text-5xl uppercase leading-none tracking-wide sm:text-6xl">
            Stop paying your China agent and praying.
          </h1>
          <p className="text-lg">
            Manifest holds your money until your goods are photographed and measured at the
            warehouse. Ship in shared containers run by forwarders who put up a guarantee.
          </p>
          {config.cluster === "mainnet-beta" ? (
            <div className="flex flex-wrap gap-3">
              <Link
                href="/containers"
                className="inline-flex min-h-12 items-center rounded-lg border-2 border-accent bg-accent px-5 font-semibold text-accent-ink"
              >
                Find a container
              </Link>
              <Link
                href="/forwarder"
                className="inline-flex min-h-12 items-center rounded-lg border-2 border-ink px-5 font-semibold"
              >
                I&apos;m a forwarder
              </Link>
            </div>
          ) : (
            <>
              <TryItCard />
              <p className="flex flex-wrap gap-x-4 gap-y-2">
                <Link href="/containers" className="font-medium underline underline-offset-4">
                  Browse all containers
                </Link>
                <Link href="/forwarder" className="font-medium underline underline-offset-4">
                  I&apos;m a forwarder
                </Link>
              </p>
            </>
          )}
        </div>
        {/* Illustration slot: replace app/public/illustrations/hero.svg with Greg's artwork. */}
        <Image
          src="/illustrations/hero.svg"
          alt=""
          width={1200}
          height={800}
          priority
          unoptimized
          className="h-auto w-full rounded-xl border-2 border-rule"
        />
      </section>

      <LiveStats />

      <section className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <Card key={s.title}>
            <p className="font-stencil text-4xl text-accent">0{i + 1}</p>
            <h2 className="mt-2 text-xl font-semibold">{s.title}</h2>
            <p className="mt-2 text-ink-muted">{s.body}</p>
          </Card>
        ))}
      </section>
    </main>
  );
}
