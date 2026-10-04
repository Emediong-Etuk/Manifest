"use client";

import {
  allowedActions,
  type ConsignmentAccount,
  type ContainerAccount,
  decodeFixed,
  deriveStage,
  formatUsd,
  toConsignmentView,
  toContainerView,
  toWindowsView,
} from "@manifest/sdk";
import type { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useMemo } from "react";

import { EmptyState, RouteLine, StageStamp } from "@/components/manifest";
import { Button, Card, PageShell, PageTitle, Skeleton } from "@/components/ui";
import {
  useConfigAccount,
  useConsignments,
  useContainers,
  useHeldTicketMints,
  useNow,
  useSolBalance,
  useTokenBalance,
} from "@/hooks/queries";
import { config } from "@/lib/config";
import { useWallet } from "@/lib/wallet/context";

const NEXT_STEP: Record<string, string> = {
  approve: "Review the warehouse photos",
  refund: "Take your refund",
  top_up_freight: "Top up freight",
  confirm_pickup: "Collect your goods",
  show_pickup_qr: "Collect your goods",
  auto_approve: "Settle the shipment",
};

function ShipmentRow({
  address,
  consignment,
  container,
  nextStep,
  now,
}: {
  address: PublicKey;
  consignment: ConsignmentAccount;
  container: ContainerAccount;
  nextStep?: string;
  now: number;
}) {
  const stage = deriveStage(toConsignmentView(consignment), toContainerView(container), now);
  return (
    <Link
      href={`/s/${address.toBase58()}`}
      className="block rounded-xl border-2 border-rule bg-paper-raised p-4 hover:border-ink"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-stencil text-xl tracking-wide">
            {decodeFixed(container.code)}-{consignment.index}
          </p>
          <p className="text-ink-muted">{decodeFixed(consignment.description)}</p>
        </div>
        <StageStamp stage={stage} />
      </div>
      <div className="mt-3">
        <RouteLine
          origin={decodeFixed(container.origin)}
          destination={decodeFixed(container.destination)}
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span>{formatUsd(consignment.goodsAmount)} goods</span>
        {nextStep && <span className="font-semibold text-accent">Next: {nextStep} →</span>}
      </div>
    </Link>
  );
}

export default function MePage() {
  const wallet = useWallet();
  const me = wallet.publicKey;
  const now = useNow();
  const configAccount = useConfigAccount();
  const mine = useConsignments({ trader: me ?? undefined }, Boolean(me));
  const all = useConsignments({}, Boolean(me));
  const containers = useContainers();
  const held = useHeldTicketMints(me);
  const sol = useSolBalance(me);
  const usd = useTokenBalance(me, config.demoMint);

  const byContainer = useMemo(
    () => new Map((containers.data ?? []).map((c) => [c.address.toBase58(), c.account])),
    [containers.data],
  );

  if (!wallet.ready)
    return (
      <PageShell>
        <Skeleton className="h-64" />
      </PageShell>
    );
  if (!me) {
    return (
      <PageShell>
        <PageTitle title="My shipments" />
        <EmptyState
          title="Connect your wallet to see your shipments"
          illustration="empty-shipments"
        >
          <Button className="mt-2" onClick={wallet.connect}>
            Connect wallet
          </Button>
        </EmptyState>
      </PageShell>
    );
  }

  const windows = configAccount.data ? toWindowsView(configAccount.data) : null;
  const myShipments = (mine.data ?? [])
    .filter((s) => byContainer.has(s.account.container.toBase58()))
    .sort((a, b) => b.account.bookedAt.toNumber() - a.account.bookedAt.toNumber());
  const bought = (all.data ?? []).filter(
    (s) => held.data?.has(s.account.cargoTicketMint.toBase58()) && !s.account.trader.equals(me),
  );

  return (
    <PageShell>
      <PageTitle title="My shipments">
        <p className="text-sm text-ink-muted">
          Balance: <strong>{formatUsd(usd.data ?? 0n)}</strong> test dollars ·{" "}
          {((sol.data ?? 0) / 1e9).toFixed(3)} SOL for fees
        </p>
      </PageTitle>

      {mine.isLoading || containers.isLoading ? (
        <Skeleton className="h-40" />
      ) : myShipments.length === 0 ? (
        <EmptyState title="No shipments yet" illustration="empty-shipments">
          <Link className="font-semibold text-accent underline" href="/containers">
            Find a container
          </Link>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {myShipments.map((s) => {
            const k = byContainer.get(s.account.container.toBase58());
            if (!k) return null;
            const holds = held.data?.has(s.account.cargoTicketMint.toBase58()) ?? false;
            const actions = windows
              ? allowedActions(
                  holds ? ["trader", "holder"] : ["trader"],
                  toConsignmentView(s.account),
                  toContainerView(k),
                  windows,
                  now,
                )
              : [];
            const next = actions.map((a) => NEXT_STEP[a]).find(Boolean);
            return (
              <ShipmentRow
                key={s.address.toBase58()}
                address={s.address}
                consignment={s.account}
                container={k}
                nextStep={next}
                now={now}
              />
            );
          })}
        </div>
      )}

      <Card>
        <h2 className="text-xl font-semibold">Cargo Tickets you bought</h2>
        <p className="mb-3 text-sm text-ink-muted">
          Goods in transit you hold the ticket for but didn&apos;t book yourself.
        </p>
        {bought.length === 0 ? (
          <p className="text-ink-muted">None yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {bought.map((s) => {
              const k = byContainer.get(s.account.container.toBase58());
              return k ? (
                <ShipmentRow
                  key={s.address.toBase58()}
                  address={s.address}
                  consignment={s.account}
                  container={k}
                  now={now}
                />
              ) : null;
            })}
          </div>
        )}
      </Card>
    </PageShell>
  );
}
