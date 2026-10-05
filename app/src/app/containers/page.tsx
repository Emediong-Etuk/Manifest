"use client";

import { decodeFixed, locodeCity } from "@manifest/sdk";
import { useMemo, useState } from "react";

import { ContainerCard, EmptyState } from "@/components/manifest";
import { Field, inputClass, PageShell, PageTitle, Skeleton, NetworkError } from "@/components/ui";
import { useContainers, useForwarders, useNow } from "@/hooks/queries";

export default function ContainersPage() {
  const containers = useContainers({ status: "open" });
  const forwarders = useForwarders();
  const now = useNow();
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");

  const byForwarder = useMemo(
    () => new Map((forwarders.data ?? []).map((f) => [f.address.toBase58(), f.account])),
    [forwarders.data],
  );
  const open = (containers.data ?? []).filter((c) => c.account.cutoffTs.toNumber() > now);
  const origins = [...new Set(open.map((c) => decodeFixed(c.account.origin)))];
  const destinations = [...new Set(open.map((c) => decodeFixed(c.account.destination)))];
  const shown = open
    .filter((c) => !origin || decodeFixed(c.account.origin) === origin)
    .filter((c) => !destination || decodeFixed(c.account.destination) === destination)
    .sort((a, b) => a.account.cutoffTs.toNumber() - b.account.cutoffTs.toNumber());

  const select = (label: string, value: string, set: (v: string) => void, options: string[]) => (
    <Field label={label}>
      {(id) => (
        <select id={id} className={inputClass} value={value} onChange={(e) => set(e.target.value)}>
          <option value="">Any</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {locodeCity(o)} ({o})
            </option>
          ))}
        </select>
      )}
    </Field>
  );

  return (
    <PageShell wide>
      <PageTitle title="Open containers">
        <p className="text-ink-muted">
          Shared containers taking bookings now. Every forwarder here has posted a guarantee
          onchain.
        </p>
      </PageTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {select("From", origin, setOrigin, origins)}
        {select("To", destination, setDestination, destinations)}
      </div>
      {containers.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      ) : containers.isError ? (
        <NetworkError what="containers" onRetry={() => void containers.refetch()} />
      ) : shown.length === 0 ? (
        <EmptyState title="No open containers right now" illustration="empty-containers">
          New containers open every week. Check back soon.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {shown.map((c) => (
            <ContainerCard
              key={c.address.toBase58()}
              address={c.address.toBase58()}
              container={c.account}
              forwarder={byForwarder.get(c.account.forwarder.toBase58())}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
