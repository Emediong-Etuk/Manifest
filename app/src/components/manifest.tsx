"use client";

/** Domain components: routes, containers, tickets, timelines, trust. */
import {
  type ConsignmentAccount,
  type ContainerAccount,
  containerMode,
  decodeFixed,
  formatCbm,
  formatCountdown,
  formatUsd,
  type ForwarderAccount,
  locodeCity,
  manifestScore,
  shortAddress,
  type Stage,
  STAGE_LABEL,
  TIMELINE,
  timelineIndex,
} from "@manifest/sdk";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { useNow } from "@/hooks/queries";

import { Card, Stamp } from "./ui";

export function RouteLine({
  origin,
  destination,
  large = false,
}: {
  origin: string;
  destination: string;
  large?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 font-mono ${large ? "text-lg" : "text-sm"}`}>
      <span title={locodeCity(origin)}>{origin}</span>
      <span aria-hidden className="flex-1 border-t-2 border-dashed border-ink-muted" />
      <span aria-hidden>▶</span>
      <span title={locodeCity(destination)}>{destination}</span>
      <span className="sr-only">
        from {locodeCity(origin)} to {locodeCity(destination)}
      </span>
    </div>
  );
}

export function CountdownChip({ to, label }: { to: number; label: string }) {
  const now = useNow();
  const left = to - now;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm ${
        left <= 0
          ? "border-ink-muted text-ink-muted"
          : left < 86_400
            ? "border-accent text-accent"
            : "border-rule"
      }`}
    >
      {label} {left <= 0 ? "passed" : `in ${formatCountdown(left)}`}
    </span>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div>
      <div
        className="h-3 overflow-hidden rounded-full bg-rule/60"
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function scoreLabel(f: ForwarderAccount): string {
  const score = manifestScore({
    delivered: f.statsConsignmentsDelivered,
    onTime: f.statsOnTime,
    disputesLost: f.statsDisputesLost,
  });
  return score === null ? "New forwarder" : `Score ${score}`;
}

export const SCORE_FORMULA =
  "Manifest Score = 100 × on-time rate × (1 − share of disputes lost). Shown after 3 deliveries, computed from the forwarder's onchain record.";

export function ContainerCard({
  address,
  container,
  forwarder,
}: {
  address: string;
  container: ContainerAccount;
  forwarder?: ForwarderAccount | null;
}) {
  const origin = decodeFixed(container.origin);
  const destination = decodeFixed(container.destination);
  const left = container.capacityCbmMilli - container.bookedCbmMilli;
  return (
    <Link
      href={`/c/${address}`}
      className="block rounded-xl border-2 border-rule bg-paper-raised p-4 transition hover:border-ink"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-stencil text-2xl tracking-wide">{decodeFixed(container.code)}</span>
        <span className="rounded-full border border-rule px-2 py-0.5 text-sm uppercase">
          {containerMode(container)}
        </span>
      </div>
      <p className="mt-1 text-ink-muted">
        {locodeCity(origin)} → {locodeCity(destination)}
      </p>
      <div className="mt-3">
        <RouteLine origin={origin} destination={destination} />
      </div>
      <div className="mt-3 flex flex-col gap-1">
        <ProgressBar
          value={container.bookedCbmMilli}
          max={container.capacityCbmMilli}
          label="Space booked"
        />
        <p className="text-sm">
          <strong>{formatCbm(left)}</strong> left of {formatCbm(container.capacityCbmMilli)} ·{" "}
          {formatUsd(container.ratePerCbm)}/CBM
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CountdownChip to={container.cutoffTs.toNumber()} label="Cut-off" />
        {forwarder && (
          <span className="text-sm text-ink-muted">
            {decodeFixed(forwarder.name)} · {scoreLabel(forwarder)}
          </span>
        )}
      </div>
    </Link>
  );
}

/** Bond vs locked coverage: how much more the forwarder's guarantee can back. */
export function CoverageMeter({ forwarder }: { forwarder: ForwarderAccount }) {
  const bond = Number(forwarder.bondBalance.toString());
  const locked = Number(forwarder.lockedCoverage.toString());
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-sm">
        <span>Guarantee in use</span>
        <span>
          {formatUsd(forwarder.lockedCoverage)} of {formatUsd(forwarder.bondBalance)}
        </span>
      </div>
      <ProgressBar value={locked} max={bond} label="Guarantee in use" />
    </div>
  );
}

export function ForwarderTrustPanel({
  address,
  forwarder,
}: {
  address: string;
  forwarder: ForwarderAccount;
}) {
  const delivered = forwarder.statsConsignmentsDelivered;
  const onTimePct = delivered === 0 ? null : Math.round((forwarder.statsOnTime / delivered) * 100);
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-muted">Forwarder</p>
          <Link
            href={`/f/${address}`}
            className="text-xl font-semibold underline decoration-rule underline-offset-4"
          >
            {decodeFixed(forwarder.name)}
          </Link>
        </div>
        <span title={SCORE_FORMULA}>
          <Stamp tone={delivered >= 3 ? "stamp" : "muted"}>{scoreLabel(forwarder)}</Stamp>
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Delivered" value={String(delivered)} />
        <Stat label="On time" value={onTimePct === null ? "—" : `${onTimePct}%`} />
        <Stat label="Disputes lost" value={String(forwarder.statsDisputesLost)} />
      </dl>
      <div className="mt-4">
        <p className="mb-2 text-sm">
          <strong>Forwarder&apos;s guarantee:</strong> {formatUsd(forwarder.bondBalance)} locked
          onchain. If your goods go missing after loading, Manifest&apos;s arbitrators can pay you
          from it.
        </p>
        <CoverageMeter forwarder={forwarder} />
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-paper p-2">
      <dd className="font-stencil text-2xl">{value}</dd>
      <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
    </div>
  );
}

const STAGE_TONES: Record<Stage, "accent" | "stamp" | "ink" | "danger" | "muted"> = {
  AWAITING_GOODS: "ink",
  REVIEW_PHOTOS: "accent",
  PAID_SUPPLIER: "stamp",
  LOADED: "stamp",
  SAILING: "stamp",
  ARRIVED_READY_FOR_PICKUP: "accent",
  COLLECTED: "stamp",
  REFUNDED: "muted",
  IN_DISPUTE: "danger",
  COMPENSATED: "ink",
  SETTLED: "muted",
};

export function StageStamp({ stage }: { stage: Stage }) {
  return <Stamp tone={STAGE_TONES[stage]}>{STAGE_LABEL[stage]}</Stamp>;
}

export function TimelineStepper({ stage }: { stage: Stage }) {
  // A collected/settled shipment has completed every step.
  const finished = stage === "COLLECTED" || stage === "SETTLED";
  const current = finished ? TIMELINE.length : timelineIndex(stage);
  return (
    <ol className="flex flex-col gap-0 sm:flex-row sm:gap-1">
      {TIMELINE.map((step, i) => {
        const done = current >= 0 && i < current;
        const active = i === current;
        return (
          <li
            key={step.stage}
            className="flex items-center gap-3 sm:flex-1 sm:flex-col sm:gap-1 sm:text-center"
          >
            <span
              aria-hidden
              className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                done
                  ? "border-stamp bg-stamp text-paper"
                  : active
                    ? "border-accent text-accent"
                    : "border-rule text-ink-muted"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={`py-1 text-sm ${active ? "font-semibold" : done ? "" : "text-ink-muted"}`}
            >
              {step.label}
              {active && <span className="sr-only"> (current)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The Cargo Ticket as a perforated boarding-pass card. */
export function CargoTicketCard({
  container,
  consignment,
  holder,
  void: isVoid = false,
}: {
  container: ContainerAccount;
  consignment: ConsignmentAccount;
  holder?: string | null;
  void?: boolean;
}) {
  const origin = decodeFixed(container.origin);
  const destination = decodeFixed(container.destination);
  return (
    <div className="relative overflow-hidden rounded-xl border-2 border-ink bg-paper-raised">
      <div className="flex">
        <div className="flex-1 p-4">
          <p className="font-mono text-xs uppercase tracking-widest text-ink-muted">
            Manifest Cargo Ticket
          </p>
          <p className="font-stencil text-3xl tracking-wide">
            {decodeFixed(container.code)}-{consignment.index}
          </p>
          <div className="mt-2">
            <RouteLine origin={origin} destination={destination} />
          </div>
          <p className="mt-2 text-sm">
            {consignment.cartonCount} cartons · {formatCbm(consignment.measuredCbmMilli)}
          </p>
          {holder && (
            <p className="mt-1 font-mono text-xs text-ink-muted">Holder {shortAddress(holder)}</p>
          )}
        </div>
        <div aria-hidden className="w-0 border-l-2 border-dashed border-ink" />
        <div className="flex w-24 flex-col items-center justify-center gap-1 p-2 text-center">
          <span className="font-stencil text-sm uppercase">Pickup</span>
          <span className="font-mono text-xs">{destination}</span>
        </div>
      </div>
      {isVoid && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Stamp tone="danger">Void</Stamp>
        </span>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  illustration,
}: {
  title: string;
  children?: ReactNode;
  illustration?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-rule p-8 text-center">
      {/* Illustration slot: Greg's artwork goes in app/public/illustrations (see README there). */}
      {illustration && (
        <Image
          src={`/illustrations/${illustration}.svg`}
          alt=""
          width={480}
          height={360}
          unoptimized
          className="h-32 w-auto"
        />
      )}
      <p className="text-lg font-semibold">{title}</p>
      {children && <div className="text-ink-muted">{children}</div>}
    </div>
  );
}
