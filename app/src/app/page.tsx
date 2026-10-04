"use client";

import { consignmentStatus, formatUsd } from "@manifest/sdk";
import Image from "next/image";
import Link from "next/link";

import { RouteLine } from "@/components/manifest";
import { Card } from "@/components/ui";
import { useConsignments, useContainers } from "@/hooks/queries";

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
    ["Value locked now", loading ? "…" : formatUsd(secured)],
    ["Shipments delivered", loading ? "…" : String(delivered)],
  ];
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {stats.map(([label, value]) => (
        <div key={label} className="rounded-xl border-2 border-rule bg-paper-raised p-4">
          <dd className="font-stencil text-3xl">{value}</dd>
          <dt className="text-sm text-ink-muted">{label}</dt>
        </div>
      ))}
    </dl>
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
