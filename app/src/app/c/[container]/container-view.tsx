"use client";

import {
  containerMode,
  containerStatus,
  decodeFixed,
  formatCbm,
  formatUsd,
  locodeCity,
} from "@manifest/sdk";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  CountdownChip,
  EmptyState,
  ForwarderTrustPanel,
  ProgressBar,
  RouteLine,
} from "@/components/manifest";
import { ShareContainer } from "@/components/share";
import {
  Card,
  KeyValue,
  PageShell,
  PageTitle,
  Skeleton,
  Stamp,
  NetworkError,
} from "@/components/ui";
import { useContainer, useForwarder, useNow, usePubkeyParam } from "@/hooks/queries";
import { config } from "@/lib/config";
import { formatDate, formatDateTime, mintSymbol, shareText } from "@/lib/display";

export function ContainerView() {
  const params = useParams<{ container: string }>();
  const address = usePubkeyParam(params.container);
  const container = useContainer(address);
  const forwarder = useForwarder(container.data?.forwarder ?? null);
  const now = useNow();

  if (!address)
    return (
      <PageShell>
        <EmptyState title="That container link isn't valid." />
      </PageShell>
    );
  if (container.isLoading)
    return (
      <PageShell>
        <Skeleton className="h-96" />
      </PageShell>
    );
  if (container.isError)
    return (
      <PageShell>
        <NetworkError
          what="this container"
          onRetry={() => {
            void container.refetch();
          }}
        />
      </PageShell>
    );
  const c = container.data;
  if (!c)
    return (
      <PageShell>
        <EmptyState title="Container not found" illustration="not-found" />
      </PageShell>
    );

  const code = decodeFixed(c.code);
  const origin = decodeFixed(c.origin);
  const destination = decodeFixed(c.destination);
  const status = containerStatus(c);
  const bookable = status === "open" && c.cutoffTs.toNumber() > now;
  const left = c.capacityCbmMilli - c.bookedCbmMilli;
  const text = shareText(
    code,
    locodeCity(origin),
    locodeCity(destination),
    `${config.appUrl}/c/${address.toBase58()}`,
  );

  return (
    <PageShell>
      <PageTitle
        eyebrow={<RouteLine origin={origin} destination={destination} large />}
        title={code}
      >
        <p className="text-lg text-ink-muted">
          {locodeCity(origin)} → {locodeCity(destination)} ·{" "}
          {containerMode(c) === "sea" ? "Sea freight" : "Air freight"}
        </p>
        <div className="flex flex-wrap gap-2">
          {bookable ? (
            <Stamp tone="stamp">Taking bookings</Stamp>
          ) : (
            <Stamp tone="muted">{status === "open" ? "Cut-off passed" : status}</Stamp>
          )}
          <CountdownChip to={c.cutoffTs.toNumber()} label="Cut-off" />
        </div>
      </PageTitle>

      <Card>
        <div className="flex flex-col gap-4">
          <div>
            <ProgressBar value={c.bookedCbmMilli} max={c.capacityCbmMilli} label="Space booked" />
            <p className="mt-2">
              <strong>{formatCbm(left)}</strong> left of {formatCbm(c.capacityCbmMilli)}
            </p>
          </div>
          <KeyValue
            items={[
              [
                "Freight rate",
                <>
                  {formatUsd(c.ratePerCbm)} / CBM{" "}
                  <small className="text-ink-muted">{mintSymbol(c.mint)}</small>
                </>,
              ],
              ["Booking cut-off", formatDateTime(c.cutoffTs)],
              ["Expected arrival", formatDate(c.etaTs)],
              ["Bookings so far", String(c.activeCount)],
            ]}
          />
          {bookable ? (
            <Link
              href={`/book/${address.toBase58()}`}
              className="inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-accent bg-accent px-5 font-semibold text-accent-ink"
            >
              Book space
            </Link>
          ) : (
            <p className="text-ink-muted">This container is no longer taking bookings.</p>
          )}
        </div>
      </Card>

      {forwarder.data && (
        <ForwarderTrustPanel address={c.forwarder.toBase58()} forwarder={forwarder.data} />
      )}

      <ShareContainer container={address.toBase58()} text={text} />
    </PageShell>
  );
}
