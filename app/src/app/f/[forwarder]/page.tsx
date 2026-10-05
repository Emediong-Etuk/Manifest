"use client";

import { containerStatus, decodeFixed, explorerUrl, formatUsd, locodeCity } from "@manifest/sdk";
import Link from "next/link";
import { useParams } from "next/navigation";

import { EmptyState, SCORE_FORMULA, scoreLabel } from "@/components/manifest";
import { Card, PageShell, PageTitle, Skeleton, Stamp } from "@/components/ui";
import { useContainers, useForwarder, usePubkeyParam } from "@/hooks/queries";
import { config } from "@/lib/config";
import { formatDate } from "@/lib/display";

export default function ForwarderProfile() {
  const params = useParams<{ forwarder: string }>();
  const address = usePubkeyParam(params.forwarder);
  const forwarder = useForwarder(address);
  const containers = useContainers({ forwarder: address ?? undefined });

  if (!address)
    return (
      <PageShell>
        <EmptyState title="That forwarder link isn't valid." />
      </PageShell>
    );
  if (forwarder.isLoading)
    return (
      <PageShell>
        <Skeleton className="h-96" />
      </PageShell>
    );
  const f = forwarder.data;
  if (!f)
    return (
      <PageShell>
        <EmptyState title="Forwarder not found" illustration="not-found" />
      </PageShell>
    );

  const delivered = f.statsConsignmentsDelivered;
  const stats: [string, string][] = [
    ["Delivered", String(delivered)],
    ["On time", delivered ? `${Math.round((f.statsOnTime / delivered) * 100)}%` : "—"],
    ["Disputes opened", String(f.statsDisputesOpened)],
    ["Disputes lost", String(f.statsDisputesLost)],
    ["Goods delivered", formatUsd(f.statsVolume)],
    ["Guarantee", formatUsd(f.bondBalance)],
  ];
  const list = (containers.data ?? []).sort((a, b) => b.account.index - a.account.index);

  return (
    <PageShell>
      <PageTitle title={decodeFixed(f.name)}>
        <div className="flex flex-wrap items-center gap-3">
          <Stamp tone={delivered >= 3 ? "stamp" : "muted"}>{scoreLabel(f)}</Stamp>
          <span className="text-sm text-ink-muted">Member since {formatDate(f.createdAt)}</span>
        </div>
        <p className="text-sm text-ink-muted">{SCORE_FORMULA}</p>
      </PageTitle>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border-2 border-rule bg-paper-raised p-4">
            <dd className="font-stencil text-2xl">{value}</dd>
            <dt className="text-sm text-ink-muted">{label}</dt>
          </div>
        ))}
      </dl>
      <Card>
        <h2 className="mb-3 text-xl font-semibold">Containers</h2>
        {list.length === 0 ? (
          <p className="text-ink-muted">No containers yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-rule">
            {list.map((c) => (
              <li
                key={c.address.toBase58()}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <Link className="font-semibold underline" href={`/c/${c.address.toBase58()}`}>
                  {decodeFixed(c.account.code)}
                </Link>
                <span className="text-sm">
                  {locodeCity(decodeFixed(c.account.origin))} →{" "}
                  {locodeCity(decodeFixed(c.account.destination))}
                </span>
                <span className="text-sm uppercase text-ink-muted">
                  {containerStatus(c.account)}
                </span>
                <a
                  className="text-sm underline"
                  href={explorerUrl("address", c.address.toBase58(), config.cluster)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Explorer
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-sm text-ink-muted">
        Every number here is read from this forwarder&apos;s account on Solana:{" "}
        <a
          className="underline"
          href={explorerUrl("address", address.toBase58(), config.cluster)}
          target="_blank"
          rel="noreferrer"
        >
          view it on Explorer
        </a>
        .
      </p>
    </PageShell>
  );
}
