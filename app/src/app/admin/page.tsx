"use client";

/**
 * Dispute queue for the arbitrators. Everything is read from the program: disputed
 * shipments, the arbitrator (a 2-of-3 Squads vault) and the protocol fees it holds.
 * Resolutions are Squads proposals (scripts/src/resolve-dispute.ts), so this page shows
 * the exact command for each allowed outcome instead of a button that a single wallet
 * could press.
 */
import {
  type ConsignmentAccount,
  consignmentPrevStatus,
  decodeFixed,
  DISPUTE_REASONS,
  type DisputeReason,
  explorerUrl,
  formatUsd,
  shortAddress,
} from "@manifest/sdk";
import type { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";

import { EmptyState } from "@/components/manifest";
import {
  Button,
  Card,
  KeyValue,
  PageShell,
  PageTitle,
  Skeleton,
  Stamp,
  NetworkError,
} from "@/components/ui";
import {
  useConfigAccount,
  useConsignments,
  useContainers,
  useTicketHolder,
  useTokenBalance,
} from "@/hooks/queries";
import { config } from "@/lib/config";

const explorer = (address: string) => explorerUrl("address", address, config.cluster);

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2">
      <code className="block flex-1 break-all rounded-lg bg-paper p-2 font-mono text-xs">
        {command}
      </code>
      <Button
        variant="secondary"
        className="min-h-10 px-3 text-sm"
        onClick={() => void navigator.clipboard.writeText(command).then(() => setCopied(true))}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function DisputeCard({
  address,
  consignment,
  code,
}: {
  address: PublicKey;
  consignment: ConsignmentAccount;
  code: string;
}) {
  const holder = useTicketHolder(consignment.cargoTicketMint);
  const preApproval = consignmentPrevStatus(consignment) === "received";
  const reason =
    DISPUTE_REASONS[consignment.disputeReason as DisputeReason] ??
    `Reason ${consignment.disputeReason}`;
  const base = `pnpm --filter @manifest/scripts resolve-dispute --consignment ${address.toBase58()}`;
  const options: [string, string][] = preApproval
    ? [
        ["Refund the trader (goods rejected at the warehouse)", `${base} --resolution refund`],
        ["Pay the supplier anyway (rejection not justified)", `${base} --resolution force-approve`],
        ["Send back to review", `${base} --resolution dismiss`],
      ]
    : [
        [
          "Pay the ticket holder from the forwarder's guarantee",
          `${base} --resolution slash --amount 500`,
        ],
        ["Dismiss (no fault found)", `${base} --resolution dismiss`],
      ];

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/s/${address.toBase58()}`}
            className="font-stencil text-xl tracking-wide underline decoration-rule"
          >
            {code}-{consignment.index}
          </Link>
          <p className="text-ink-muted">{decodeFixed(consignment.description)}</p>
        </div>
        <Stamp tone="danger">{reason}</Stamp>
      </div>
      <div className="mt-3">
        <KeyValue
          items={[
            [
              "Raised",
              preApproval
                ? "At the warehouse, before the supplier was paid"
                : "After the supplier was paid",
            ],
            ["Goods value", formatUsd(consignment.goodsAmount)],
            [
              "Trader",
              <a
                key="t"
                className="font-mono underline"
                href={explorer(consignment.trader.toBase58())}
                target="_blank"
                rel="noreferrer"
              >
                {shortAddress(consignment.trader.toBase58())}
              </a>,
            ],
            [
              "Ticket holder",
              holder.data ? (
                <a
                  key="h"
                  className="font-mono underline"
                  href={explorer(holder.data.owner.toBase58())}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortAddress(holder.data.owner.toBase58())}
                </a>
              ) : (
                "—"
              ),
            ],
          ]}
        />
      </div>
      <p className="mt-4 mb-2 text-sm font-semibold">Resolve through Squads (2 of 3 approvals):</p>
      <div className="flex flex-col gap-3">
        {options.map(([label, command]) => (
          <div key={label}>
            <p className="mb-1 text-sm">{label}</p>
            <CopyCommand command={command} />
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function AdminPage() {
  const cfg = useConfigAccount();
  const disputes = useConsignments({ status: "disputed" });
  const compensated = useConsignments({ status: "compensated" });
  const containers = useContainers();
  const treasury = cfg.data?.treasuryOwner ?? null;
  const fees = useTokenBalance(treasury, config.demoMint);

  const codes = useMemo(() => {
    const m = new Map<string, string>();
    for (const k of containers.data ?? []) m.set(k.address.toBase58(), decodeFixed(k.account.code));
    return m;
  }, [containers.data]);
  const codeOf = (c: ConsignmentAccount) => codes.get(c.container.toBase58()) ?? "Shipment";

  const arbitrator = cfg.data?.arbitrator.toBase58();
  const isSquads = !!cfg.data && !!config.squadsVault?.equals(cfg.data.arbitrator);

  return (
    <PageShell>
      <PageTitle title="Disputes">
        <p className="text-ink-muted">
          Arbitrators can refund the trader, pay the supplier, send a case back, or pay the Cargo
          Ticket holder from the forwarder&apos;s guarantee. They can never pay themselves: the
          program only lets money go to the parties of the shipment.
        </p>
      </PageTitle>

      <Card>
        {cfg.isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <KeyValue
            items={[
              [
                "Arbitrator",
                arbitrator ? (
                  <a
                    key="a"
                    className="font-mono underline"
                    href={explorer(arbitrator)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {shortAddress(arbitrator)}
                  </a>
                ) : (
                  "—"
                ),
              ],
              [
                "Type",
                isSquads
                  ? "Squads v4 multisig vault, 2 of 3 members must approve"
                  : "Single key (dev setup)",
              ],
              ...(config.squadsMultisig
                ? ([
                    [
                      "Multisig",
                      <a
                        key="m"
                        className="font-mono underline"
                        href={explorer(config.squadsMultisig.toBase58())}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortAddress(config.squadsMultisig.toBase58())}
                      </a>,
                    ],
                  ] as [string, ReactNode][])
                : []),
              [
                "Protocol fees held (test dollars)",
                fees.data === undefined ? "—" : formatUsd(fees.data),
              ],
            ]}
          />
        )}
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold">Open disputes ({disputes.data?.length ?? 0})</h2>
        {disputes.isLoading && <Skeleton className="h-48" />}
        {disputes.isError && (
          <NetworkError what="disputes" onRetry={() => void disputes.refetch()} />
        )}
        {disputes.data?.length === 0 && (
          <EmptyState title="No open disputes" illustration="empty-shipments" />
        )}
        {disputes.data?.map((d) => (
          <DisputeCard
            key={d.address.toBase58()}
            address={d.address}
            consignment={d.account}
            code={codeOf(d.account)}
          />
        ))}
      </section>

      {!!compensated.data?.length && (
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold">Paid from guarantees</h2>
          {compensated.data.map((d) => (
            <Card key={d.address.toBase58()}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/s/${d.address.toBase58()}`}
                  className="font-stencil text-lg underline decoration-rule"
                >
                  {codeOf(d.account)}-{d.account.index}
                </Link>
                <span className="text-ink-muted">{decodeFixed(d.account.description)}</span>
                <Stamp tone="ink">Compensated</Stamp>
              </div>
            </Card>
          ))}
        </section>
      )}
    </PageShell>
  );
}
