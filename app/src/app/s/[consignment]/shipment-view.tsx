"use client";

/**
 * Shipment detail: timeline, evidence (hash-verified), Cargo Ticket, and the actions this
 * viewer may take (computed by the SDK's allowedActions from onchain state).
 */
import {
  type Action,
  allowedActions,
  consignmentStatus,
  decodeFixed,
  deriveStage,
  DISPUTE_REASONS,
  formatCbm,
  formatCountdown,
  formatUsd,
  ix,
  type Role,
  shortAddress,
  toConsignmentView,
  toContainerView,
  toWindowsView,
} from "@manifest/sdk";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { EvidenceGallery } from "@/components/evidence";
import { AddressInput, parsePubkey } from "@/components/inputs";
import {
  CargoTicketCard,
  EmptyState,
  RouteLine,
  StageStamp,
  TimelineStepper,
} from "@/components/manifest";
import { QrDisplay } from "@/components/qr";
import { TxButton } from "@/components/tx-button";
import {
  Button,
  Card,
  Field,
  inputClass,
  KeyValue,
  PageShell,
  PageTitle,
  Sheet,
  Skeleton,
} from "@/components/ui";
import {
  useConfigAccount,
  useConsignment,
  useContainer,
  useForwarder,
  useNow,
  usePubkeyParam,
  useTicketHolder,
} from "@/hooks/queries";
import { getManifestProgram } from "@/lib/chain";
import { mintSymbol } from "@/lib/display";
import { createPickupPayload } from "@/lib/pickup";
import { useWallet } from "@/lib/wallet/context";

export function ShipmentView() {
  const params = useParams<{ consignment: string }>();
  const address = usePubkeyParam(params.consignment);
  const consignment = useConsignment(address);
  const container = useContainer(consignment.data?.container ?? null);
  const forwarder = useForwarder(container.data?.forwarder ?? null);
  const configAccount = useConfigAccount();
  const holder = useTicketHolder(consignment.data?.cargoTicketMint ?? null);
  const wallet = useWallet();
  const now = useNow();

  if (!address)
    return (
      <PageShell>
        <EmptyState title="That shipment link isn't valid." />
      </PageShell>
    );
  if (consignment.isLoading || container.isLoading)
    return (
      <PageShell>
        <Skeleton className="h-96" />
      </PageShell>
    );
  const c = consignment.data;
  const k = container.data;
  const cfg = configAccount.data;
  if (!c || !k || !cfg)
    return (
      <PageShell>
        <EmptyState title="Shipment not found" illustration="not-found" />
      </PageShell>
    );

  const me = wallet.publicKey;
  const holderKey = holder.data?.owner ?? null;
  const roles: Role[] = ["anyone"];
  if (me?.equals(c.trader)) roles.push("trader");
  if (me && holderKey?.equals(me)) roles.push("holder");
  if (me && forwarder.data?.authority.equals(me)) roles.push("forwarder");
  if (me?.equals(cfg.arbitrator)) roles.push("arbitrator");

  const cv = toConsignmentView(c);
  const kv = toContainerView(k);
  const stage = deriveStage(cv, kv, now);
  const actions = allowedActions(roles, cv, kv, toWindowsView(cfg), now);
  const status = consignmentStatus(c);
  const symbol = mintSymbol(c.mint);
  const code = `${decodeFixed(k.code)}-${c.index}`;
  const received =
    !["booked", "rejected", "refunded"].includes(status) || c.receivedAt.toNumber() > 0;
  const hasTicket = !c.cargoTicketMint.equals(PublicKey.default);

  return (
    <PageShell>
      <PageTitle
        eyebrow={
          <RouteLine origin={decodeFixed(k.origin)} destination={decodeFixed(k.destination)} />
        }
        title={code}
      >
        <p className="text-lg">{decodeFixed(c.description)}</p>
        <div>
          <StageStamp stage={stage} />
        </div>
      </PageTitle>

      <Card>
        <TimelineStepper stage={stage} />
      </Card>

      <ActionPanel
        actions={actions}
        address={address}
        consignment={c}
        payee={c.payee}
        roles={roles}
        reviewDeadline={cv.reviewDeadline}
        now={now}
        symbol={symbol}
      />

      <Card>
        <h2 className="mb-3 text-xl font-semibold">Money</h2>
        <KeyValue
          items={[
            [
              "Goods value",
              <>
                {formatUsd(c.goodsAmount)} <small className="text-ink-muted">{symbol}</small>
              </>,
            ],
            ["Manifest fee", formatUsd(c.feeAmount)],
            [
              status === "booked" || status === "received"
                ? "Freight locked (estimate + buffer)"
                : "Freight locked",
              formatUsd(c.freightEscrowed),
            ],
            ...(c.freightDue.toNumber() > 0
              ? [["Freight due (measured)", formatUsd(c.freightDue)] as [string, string]]
              : []),
            [
              "Supplier payout address",
              <span key="p" className="font-mono">
                {shortAddress(c.payee.toBase58())}
              </span>,
            ],
          ]}
        />
      </Card>

      {received && c.evidenceHash.some((b) => b !== 0) && (
        <Card>
          <h2 className="mb-1 text-xl font-semibold">At the warehouse</h2>
          <p className="mb-3 text-sm text-ink-muted">
            {c.cartonCount} cartons · {formatCbm(c.measuredCbmMilli)} measured by the forwarder.
          </p>
          <EvidenceGallery consignment={address.toBase58()} onchainHash={c.evidenceHash} />
        </Card>
      )}

      {hasTicket && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">Cargo Ticket</h2>
          <CargoTicketCard
            container={k}
            consignment={c}
            holder={holderKey?.toBase58()}
            void={!holderKey}
          />
          <p className="text-sm text-ink-muted">
            Whoever holds this ticket can collect the goods and open disputes.{" "}
            <span title="The ticket's permanent delegate is a Manifest program address. It is used only to burn the ticket when the forwarder claims freight after the pickup period or when a dispute is settled from the bond.">
              Why can Manifest burn it? ⓘ
            </span>
          </p>
        </section>
      )}

      <p className="text-sm text-ink-muted">
        Forwarder:{" "}
        {forwarder.data ? (
          <Link className="underline" href={`/f/${k.forwarder.toBase58()}`}>
            {decodeFixed(forwarder.data.name)}
          </Link>
        ) : (
          "…"
        )}{" "}
        · Container{" "}
        <Link className="underline" href={`/c/${c.container.toBase58()}`}>
          {decodeFixed(k.code)}
        </Link>
      </p>
    </PageShell>
  );
}

function ActionPanel({
  actions,
  address,
  consignment,
  payee,
  roles,
  reviewDeadline,
  now,
  symbol,
}: {
  actions: Action[];
  address: PublicKey;
  consignment: NonNullable<ReturnType<typeof useConsignment>["data"]>;
  payee: PublicKey;
  roles: Role[];
  reviewDeadline: number;
  now: number;
  symbol: string;
}) {
  const wallet = useWallet();
  const program = getManifestProgram();
  const me = wallet.publicKey;
  const [sheet, setSheet] = useState<null | "approve" | "pickup">(null);
  const [reason, setReason] = useState("1");
  const [buyer, setBuyer] = useState("");
  const [buyerOk, setBuyerOk] = useState(false);
  const shortfall =
    BigInt(consignment.freightDue.toString()) - BigInt(consignment.freightEscrowed.toString());

  const visible = actions.filter((a) => a !== "record_receipt" && a !== "reject_booking");
  const finished = ["delivered", "settled", "refunded", "rejected", "compensated"].includes(
    consignmentStatus(consignment),
  );
  if (finished) return null;
  if (!me && !visible.includes("auto_approve")) {
    return (
      <Card>
        <p className="mb-3">Connect your wallet to see what you can do with this shipment.</p>
        <Button variant="secondary" onClick={wallet.connect}>
          Connect wallet
        </Button>
      </Card>
    );
  }
  if (visible.length === 0) {
    return roles.includes("forwarder") && actions.length > 0 ? (
      <Card>
        <Link
          className="font-semibold underline"
          href={`/forwarder/c/${consignment.container.toBase58()}`}
        >
          Manage this container
        </Link>
      </Card>
    ) : null;
  }

  return (
    <Card className="border-accent">
      <h2 className="mb-4 text-xl font-semibold">Your next step</h2>
      <div className="flex flex-col gap-5">
        {visible.includes("approve") && me && (
          <div className="flex flex-col gap-2">
            <p>
              Check the photos below. If the goods are right, approve to pay your supplier.
              Auto-approves in <strong>{formatCountdown(reviewDeadline - now)}</strong> if you do
              nothing.
            </p>
            <Button onClick={() => setSheet("approve")}>Approve goods</Button>
            <Sheet
              open={sheet === "approve"}
              onClose={() => setSheet(null)}
              title="Pay your supplier?"
            >
              <p>
                You&apos;re paying <strong>{formatUsd(consignment.goodsAmount)}</strong> {symbol} to
                supplier address <span className="font-mono">{shortAddress(payee.toBase58())}</span>
                . This can&apos;t be undone.
              </p>
              <p className="text-sm text-ink-muted">
                Any freight you locked above the measured volume comes back to you now, and you
                receive your Cargo Ticket.
              </p>
              <TxButton
                success="Supplier paid. Your Cargo Ticket is in your wallet."
                build={() => ix.approveGoods(program, { trader: me, consignment: address })}
                onSuccess={() => setSheet(null)}
              >
                Yes, pay {formatUsd(consignment.goodsAmount)}
              </TxButton>
            </Sheet>
          </div>
        )}

        {visible.includes("reject_goods") && me && (
          <div className="flex flex-col gap-2 border-t-2 border-rule pt-4">
            <p className="font-semibold">Something wrong with the goods?</p>
            <ReasonSelect value={reason} onChange={setReason} exclude={[5]} />
            <TxButton
              variant="danger"
              success="Dispute opened. Your money stays locked until Manifest's arbitrators decide."
              build={() =>
                ix.rejectGoods(program, {
                  trader: me,
                  consignment: address,
                  reason: Number(reason),
                })
              }
            >
              Reject goods and open a dispute
            </TxButton>
          </div>
        )}

        {visible.includes("auto_approve") && (
          <div className="flex flex-col gap-2">
            <p>
              The review window has ended. Anyone can settle this shipment now (the supplier gets
              paid).
            </p>
            <TxButton
              variant="secondary"
              success="Shipment settled."
              build={() =>
                me
                  ? ix.autoApprove(program, { payer: me, consignment: address })
                  : Promise.resolve([])
              }
            >
              Settle now
            </TxButton>
          </div>
        )}

        {visible.includes("refund") && me && (
          <div className="flex flex-col gap-2">
            <p>
              The cut-off passed and your goods never reached the warehouse. Take all your money
              back.
            </p>
            <TxButton
              success="Refunded in full."
              build={() => ix.refundAfterCutoff(program, { trader: me, consignment: address })}
            >
              Refund me{" "}
              {formatUsd(
                BigInt(consignment.goodsAmount.toString()) +
                  BigInt(consignment.feeAmount.toString()) +
                  BigInt(consignment.freightEscrowed.toString()),
              )}
            </TxButton>
          </div>
        )}

        {visible.includes("top_up_freight") && me && shortfall > 0n && (
          <div className="flex flex-col gap-2">
            <p>
              Your goods measured larger than estimated. Add <strong>{formatUsd(shortfall)}</strong>{" "}
              freight before pickup.
            </p>
            <TxButton
              success="Freight topped up."
              build={() =>
                ix.topUpFreight(program, { payer: me, consignment: address, amount: shortfall })
              }
            >
              Pay {formatUsd(shortfall)} freight
            </TxButton>
          </div>
        )}

        {visible.includes("show_pickup_qr") && me && <PickupQr consignment={address} holder={me} />}

        {visible.includes("confirm_pickup") && me && (
          <div className="flex flex-col gap-2">
            <p>
              Once you have your cartons, confirm pickup to release the freight to the forwarder.
            </p>
            <Button onClick={() => setSheet("pickup")}>I&apos;ve collected my goods</Button>
            <Sheet open={sheet === "pickup"} onClose={() => setSheet(null)} title="Confirm pickup?">
              <p>
                This releases <strong>{formatUsd(consignment.freightDue)}</strong> freight to the
                forwarder and uses up your Cargo Ticket. Only confirm once you have checked your
                cartons.
              </p>
              <TxButton
                success="Pickup confirmed. Thanks for shipping with Manifest."
                build={() => ix.confirmPickup(program, { holder: me, consignment: address })}
                onSuccess={() => setSheet(null)}
              >
                Confirm pickup
              </TxButton>
            </Sheet>
          </div>
        )}

        {visible.includes("transfer_ticket") && me && (
          <details className="border-t-2 border-rule pt-4">
            <summary className="cursor-pointer font-semibold">
              Sell goods in transit (transfer Cargo Ticket)
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-sm text-ink-muted">
                The buyer gets the right to collect the goods and to open disputes. Agree the price
                with them first.
              </p>
              <AddressInput
                label="Buyer's wallet address"
                value={buyer}
                onChange={setBuyer}
                confirmed={buyerOk}
                onConfirmedChange={setBuyerOk}
                forbidden={[{ key: me, reason: "That's your own wallet." }]}
              />
              <TxButton
                disabled={!buyerOk}
                success="Cargo Ticket transferred to the buyer."
                build={async () => {
                  const to = parsePubkey(buyer);
                  if (!to) throw new Error("Invalid buyer address");
                  return ix.transferCargoTicket(program, { from: me, to, consignment: address });
                }}
              >
                Transfer ticket
              </TxButton>
            </div>
          </details>
        )}

        {visible.includes("open_dispute") && me && (
          <details className="border-t-2 border-rule pt-4">
            <summary className="cursor-pointer font-semibold">
              Missing, damaged or overdue? Open a dispute
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <ReasonSelect value={reason} onChange={setReason} />
              <TxButton
                variant="danger"
                success="Dispute opened. Manifest's arbitrators will review it."
                build={() =>
                  ix.openDispute(program, {
                    holder: me,
                    consignment: address,
                    reason: Number(reason),
                  })
                }
              >
                Open dispute
              </TxButton>
            </div>
          </details>
        )}

        {visible.includes("claim_freight") && me && (
          <div className="flex flex-col gap-2">
            <p>The pickup period has ended without confirmation. Collect your freight.</p>
            <TxButton
              success="Freight claimed."
              build={() =>
                ix.claimFreightAfterGrace(program, { authority: me, consignment: address })
              }
            >
              Claim {formatUsd(consignment.freightDue)} freight
            </TxButton>
          </div>
        )}

        {visible.includes("resolve_dispute") && (
          <p>
            You&apos;re the arbitrator. Resolutions run through the Squads multisig: see{" "}
            <Link className="underline" href="/admin">
              the dispute queue
            </Link>
            .
          </p>
        )}
      </div>
    </Card>
  );
}

function ReasonSelect({
  value,
  onChange,
  exclude = [],
}: {
  value: string;
  onChange: (v: string) => void;
  exclude?: number[];
}) {
  return (
    <Field label="Reason">
      {(id) => (
        <select
          id={id}
          className={inputClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {Object.entries(DISPUTE_REASONS)
            .filter(([code]) => !exclude.includes(Number(code)))
            .map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
        </select>
      )}
    </Field>
  );
}

/** Signed pickup proof as a QR code, refreshed every 5 minutes. */
function PickupQr({ consignment, holder }: { consignment: PublicKey; holder: PublicKey }) {
  const wallet = useWallet();
  const [payload, setPayload] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const p = await createPickupPayload(consignment, holder, wallet.signMessage);
        if (!cancelled) setPayload(JSON.stringify(p));
      } catch {
        if (!cancelled) setError("Your wallet didn't sign the pickup code.");
      }
    };
    void refresh();
    const id = setInterval(() => void refresh(), 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [show, consignment, holder, wallet.signMessage]);

  return (
    <div className="flex flex-col gap-2">
      <p className="font-semibold">At the warehouse</p>
      {!show ? (
        <Button variant="secondary" onClick={() => setShow(true)}>
          Show pickup code
        </Button>
      ) : payload ? (
        <>
          <QrDisplay value={payload} label="Pickup code for the forwarder to scan" />
          <p className="text-center text-sm text-ink-muted">
            Show this to the forwarder. It refreshes every 5 minutes.
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-muted">
              Can&apos;t scan? Copy the code
            </summary>
            <textarea
              readOnly
              className={`${inputClass} mt-2 h-24 font-mono text-xs`}
              value={payload}
            />
          </details>
        </>
      ) : error ? (
        <p className="text-danger">{error}</p>
      ) : (
        <p className="text-ink-muted">Sign the pickup code in your wallet…</p>
      )}
    </div>
  );
}
