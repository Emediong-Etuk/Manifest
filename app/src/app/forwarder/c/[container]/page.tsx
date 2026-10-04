"use client";

/**
 * Forwarder's container console: per-consignment receipts (evidence upload + onchain hash),
 * rejections and freight claims; container close / load / arrive / cancel; pickup scanner.
 */
import {
  allowedActions,
  consignmentStatus,
  containerStatus,
  decodeFixed,
  deriveStage,
  formatCbm,
  formatUsd,
  fromHex,
  isValidIso6346,
  ix,
  parseCbm,
  sha256,
  shortAddress,
  toConsignmentView,
  toContainerView,
  toHex,
  toWindowsView,
  type ConsignmentAccount,
  type ContainerAccount,
} from "@manifest/sdk";
import type { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";

import { EmptyState, RouteLine, StageStamp } from "@/components/manifest";
import { QrScanner } from "@/components/qr";
import { useToast } from "@/components/toasts";
import { TxButton } from "@/components/tx-button";
import {
  Button,
  Card,
  Field,
  inputClass,
  KeyValue,
  PageShell,
  PageTitle,
  Skeleton,
  Stamp,
} from "@/components/ui";
import {
  useConfigAccount,
  useConsignments,
  useContainer,
  useForwarder,
  useNow,
  usePubkeyParam,
} from "@/hooks/queries";
import { getManifestProgram } from "@/lib/chain";
import { evidenceFieldsHash, evidenceMessage, MAX_PHOTOS } from "@/lib/evidence-auth";
import { type PickupCheck, verifyPickupPayload } from "@/lib/pickup";
import { useWallet } from "@/lib/wallet/context";

export default function ForwarderContainerPage() {
  const params = useParams<{ container: string }>();
  const address = usePubkeyParam(params.container);
  const container = useContainer(address);
  const forwarder = useForwarder(container.data?.forwarder ?? null);
  const consignments = useConsignments({ container: address ?? undefined }, Boolean(address));
  const configAccount = useConfigAccount();
  const wallet = useWallet();
  const now = useNow();

  if (!address)
    return (
      <PageShell>
        <EmptyState title="That container link isn't valid." />
      </PageShell>
    );
  if (container.isLoading || forwarder.isLoading)
    return (
      <PageShell>
        <Skeleton className="h-96" />
      </PageShell>
    );
  const k = container.data;
  const f = forwarder.data;
  const cfg = configAccount.data;
  if (!k || !f || !cfg)
    return (
      <PageShell>
        <EmptyState title="Container not found" illustration="not-found" />
      </PageShell>
    );
  const me = wallet.publicKey;
  const isOwner = Boolean(me && f.authority.equals(me));
  const status = containerStatus(k);
  const rows = (consignments.data ?? []).sort((a, b) => a.account.index - b.account.index);
  const program = getManifestProgram();

  return (
    <PageShell wide>
      <PageTitle
        eyebrow={
          <RouteLine origin={decodeFixed(k.origin)} destination={decodeFixed(k.destination)} />
        }
        title={decodeFixed(k.code)}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Stamp tone={status === "open" ? "stamp" : status === "cancelled" ? "muted" : "ink"}>
            {status}
          </Stamp>
          <span className="text-ink-muted">
            {formatCbm(k.bookedCbmMilli)} booked · {formatCbm(k.receivedCbmMilli)} received ·{" "}
            {k.approvedCount}/{k.activeCount} approved
          </span>
          <Link className="text-sm underline" href={`/c/${address.toBase58()}`}>
            Public page
          </Link>
        </div>
      </PageTitle>

      {!isOwner && (
        <Card>
          <p>
            {me
              ? "This container belongs to another forwarder. You can view it but not manage it."
              : "Connect the forwarder's wallet to manage this container."}
          </p>
          {!me && (
            <Button className="mt-3" variant="secondary" onClick={wallet.connect}>
              Connect wallet
            </Button>
          )}
        </Card>
      )}

      {isOwner && me && <ContainerActions address={address} container={k} me={me} />}

      {isOwner && me && status === "arrived" && <PickupScanner />}

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold">Shipments ({rows.length})</h2>
        {rows.length === 0 && (
          <EmptyState title="No bookings yet" illustration="empty-shipments">
            Share the container link with your traders.
          </EmptyState>
        )}
        {rows.map((row) => {
          const c = row.account;
          const cv = toConsignmentView(c);
          const actions = isOwner
            ? allowedActions(["forwarder"], cv, toContainerView(k), toWindowsView(cfg), now)
            : [];
          return (
            <Card key={row.address.toBase58()}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/s/${row.address.toBase58()}`}
                    className="font-stencil text-xl tracking-wide underline decoration-rule"
                  >
                    {decodeFixed(k.code)}-{c.index}
                  </Link>
                  <p>{decodeFixed(c.description)}</p>
                  <p className="text-sm text-ink-muted">
                    Trader {shortAddress(c.trader.toBase58())} · est. {formatCbm(c.estCbmMilli)}
                    {c.measuredCbmMilli > 0 &&
                      ` · measured ${formatCbm(c.measuredCbmMilli)}, ${c.cartonCount} cartons`}{" "}
                    · {formatUsd(c.goodsAmount)} goods
                  </p>
                </div>
                <StageStamp stage={deriveStage(cv, toContainerView(k), now)} />
              </div>
              {actions.includes("record_receipt") && me && (
                <ReceiptForm consignment={row.address} account={c} me={me} />
              )}
              {actions.includes("reject_booking") && me && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-danger">
                    Reject this booking
                  </summary>
                  <p className="my-2 text-sm text-ink-muted">
                    The trader gets everything back:{" "}
                    {formatUsd(
                      BigInt(c.goodsAmount.toString()) +
                        BigInt(c.feeAmount.toString()) +
                        BigInt(c.freightEscrowed.toString()),
                    )}
                    .
                  </p>
                  <TxButton
                    variant="danger"
                    success="Booking rejected and refunded."
                    build={() =>
                      ix.rejectBooking(program, { authority: me, consignment: row.address })
                    }
                  >
                    Reject and refund
                  </TxButton>
                </details>
              )}
              {actions.includes("claim_freight") && me && (
                <div className="mt-3">
                  <TxButton
                    success="Freight claimed."
                    build={() =>
                      ix.claimFreightAfterGrace(program, {
                        authority: me,
                        consignment: row.address,
                      })
                    }
                  >
                    Claim {formatUsd(c.freightDue)} freight
                  </TxButton>
                </div>
              )}
              {consignmentStatus(c) === "approved" &&
                status === "arrived" &&
                !actions.includes("claim_freight") && (
                  <p className="mt-2 text-sm text-ink-muted">
                    Waiting for the holder to collect. You can claim freight after the pickup
                    period.
                  </p>
                )}
            </Card>
          );
        })}
      </section>
    </PageShell>
  );
}

function ContainerActions({
  address,
  container: k,
  me,
}: {
  address: PublicKey;
  container: ContainerAccount;
  me: PublicKey;
}) {
  const program = getManifestProgram();
  const status = containerStatus(k);
  const [number, setNumber] = useState("");
  const [blHash, setBlHash] = useState<string | null>(null);
  const [blName, setBlName] = useState("");
  const numberOk = isValidIso6346(number);
  const readyToLoad = status === "closed" && k.activeCount > 0 && k.approvedCount === k.activeCount;

  return (
    <Card>
      <h2 className="mb-3 text-xl font-semibold">Container actions</h2>
      <div className="flex flex-col gap-4">
        {status === "open" && (
          <TxButton
            variant="secondary"
            success="Bookings closed."
            build={() => ix.closeBooking(program, { caller: me, container: address })}
          >
            Close bookings
          </TxButton>
        )}
        {(status === "open" || status === "closed") && k.activeCount === 0 && (
          <TxButton
            variant="danger"
            success="Container cancelled."
            build={() => ix.cancelContainer(program, { authority: me, container: address })}
          >
            Cancel container
          </TxButton>
        )}
        {status === "closed" && (
          <div className="flex flex-col gap-3 border-t-2 border-rule pt-4">
            <p className="font-semibold">Mark loaded</p>
            {!readyToLoad && (
              <p className="text-sm text-ink-muted">
                Every active shipment must be approved first ({k.approvedCount}/{k.activeCount}).
              </p>
            )}
            <Field
              label="Container number (ISO 6346)"
              hint="4 letters + 7 digits, e.g. CSQU3054383. The last digit is a check digit."
              error={
                number.length === 11 && !numberOk
                  ? "That container number doesn't pass the check digit."
                  : null
              }
            >
              {(id) => (
                <input
                  id={id}
                  className={`${inputClass} font-mono uppercase`}
                  maxLength={11}
                  value={number}
                  onChange={(e) => setNumber(e.target.value.toUpperCase())}
                />
              )}
            </Field>
            <Field
              label="Bill of lading (file)"
              hint={
                blHash
                  ? `${blName} · sha256 ${blHash.slice(0, 12)}…`
                  : "Only its fingerprint (SHA-256) is stored onchain."
              }
            >
              {(id) => (
                <input
                  id={id}
                  type="file"
                  className="text-sm"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBlName(file.name);
                    setBlHash(toHex(await sha256(new Uint8Array(await file.arrayBuffer()))));
                  }}
                />
              )}
            </Field>
            <TxButton
              disabled={!readyToLoad || !numberOk || !blHash}
              success="Container loaded."
              build={() =>
                ix.markLoaded(program, {
                  authority: me,
                  container: address,
                  containerNumber: number,
                  blHash: fromHex(blHash ?? ""),
                })
              }
            >
              Mark loaded
            </TxButton>
          </div>
        )}
        {status === "loaded" && (
          <TxButton
            success="Container arrived. Traders can now collect."
            build={() => ix.markArrived(program, { authority: me, container: address })}
          >
            Mark arrived at {decodeFixed(k.destination)}
          </TxButton>
        )}
        {status === "loaded" || status === "arrived" || status === "completed" ? (
          <KeyValue
            items={[
              [
                "Container number",
                <span key="n" className="font-mono">
                  {decodeFixed(k.containerNumber)}
                </span>,
              ],
              [
                "Bill of lading",
                <span key="b" className="font-mono">
                  {toHex(k.blHash).slice(0, 16)}…
                </span>,
              ],
            ]}
          />
        ) : null}
      </div>
    </Card>
  );
}

interface Row {
  item: string;
  qty: string;
}

/** Record receipt: photos + measurements → signed upload → hash → record_receipt tx. */
function ReceiptForm({
  consignment,
  account,
  me,
}: {
  consignment: PublicKey;
  account: ConsignmentAccount;
  me: PublicKey;
}) {
  const wallet = useWallet();
  const [photos, setPhotos] = useState<File[]>([]);
  const [cbm, setCbm] = useState((account.estCbmMilli / 1000).toString());
  const [cartons, setCartons] = useState("");
  const [rows, setRows] = useState<Row[]>([{ item: "", qty: "" }]);
  const [notes, setNotes] = useState("");
  const [stage, setStage] = useState<string | null>(null);

  let measured = 0;
  try {
    measured = parseCbm(cbm);
  } catch {
    measured = 0;
  }
  const cartonCount = Number(cartons);
  const packingList = rows
    .filter((r) => r.item.trim() && Number(r.qty) > 0)
    .map((r) => ({ item: r.item.trim(), qty: Math.floor(Number(r.qty)) }));
  const valid =
    photos.length > 0 &&
    photos.length <= MAX_PHOTOS &&
    measured > 0 &&
    Number.isInteger(cartonCount) &&
    cartonCount > 0;

  return (
    <details className="mt-3 rounded-lg border-2 border-accent p-3" open>
      <summary className="cursor-pointer font-semibold">
        Goods arrived at the warehouse: record receipt
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <Field
          label={`Photos of the cartons (1–${MAX_PHOTOS})`}
          hint={
            photos.length
              ? `${photos.length} selected`
              : "Use your camera. Location data is removed."
          }
        >
          {(id) => (
            <input
              id={id}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="text-sm"
              onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS))}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Measured volume (CBM)">
            {(id) => (
              <input
                id={id}
                inputMode="decimal"
                className={inputClass}
                value={cbm}
                onChange={(e) => setCbm(e.target.value)}
              />
            )}
          </Field>
          <Field label="Cartons">
            {(id) => (
              <input
                id={id}
                inputMode="numeric"
                className={inputClass}
                value={cartons}
                onChange={(e) => setCartons(e.target.value)}
              />
            )}
          </Field>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold">Packing list</legend>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_6rem] gap-2">
              <input
                aria-label={`Item ${i + 1}`}
                placeholder="Item"
                className={inputClass}
                value={r.item}
                onChange={(e) =>
                  setRows(rows.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)))
                }
              />
              <input
                aria-label={`Quantity ${i + 1}`}
                placeholder="Qty"
                inputMode="numeric"
                className={inputClass}
                value={r.qty}
                onChange={(e) =>
                  setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))
                }
              />
            </div>
          ))}
          <button
            type="button"
            className="self-start text-sm font-semibold underline"
            onClick={() => setRows([...rows, { item: "", qty: "" }])}
          >
            + Add item
          </button>
        </fieldset>
        <Field label="Notes (optional)">
          {(id) => (
            <textarea
              id={id}
              className={`${inputClass} h-20 py-2`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
            />
          )}
        </Field>
        {stage && <p className="text-sm text-ink-muted">{stage}</p>}
        <TxButton
          disabled={!valid}
          success="Receipt recorded onchain. The trader can now review the photos."
          build={async () => {
            setStage("Compressing photos…");
            const { default: compress } = await import("browser-image-compression");
            const files = await Promise.all(
              photos.map((p) =>
                compress(p, { maxSizeMB: 1, maxWidthOrHeight: 2000, useWebWorker: true }),
              ),
            );
            const photoHashes = await Promise.all(
              files.map(async (p) => toHex(await sha256(new Uint8Array(await p.arrayBuffer())))),
            );
            const ts = Math.floor(Date.now() / 1000);
            const fieldsHash = await evidenceFieldsHash({
              consignment: consignment.toBase58(),
              measuredCbmMilli: measured,
              cartonCount,
              packingList,
              notes,
              photoHashes,
            });
            setStage("Sign the upload in your wallet…");
            const signature = await wallet.signMessage(
              evidenceMessage(consignment.toBase58(), fieldsHash, ts),
            );
            setStage("Uploading evidence…");
            const body = new FormData();
            body.append("consignment", consignment.toBase58());
            body.append("measuredCbmMilli", String(measured));
            body.append("cartonCount", String(cartonCount));
            body.append("packingList", JSON.stringify(packingList));
            body.append("notes", notes);
            body.append("signer", me.toBase58());
            body.append("ts", String(ts));
            body.append("signature", bs58.encode(signature));
            files.forEach((file, i) => body.append("photos", file, `photo-${i}.jpg`));
            const res = await fetch("/api/evidence", { method: "POST", body });
            const json = (await res.json()) as { manifestHashHex?: string; error?: string };
            if (!res.ok || !json.manifestHashHex)
              throw new Error(json.error ?? "Evidence upload failed");
            setStage("Recording the evidence fingerprint onchain…");
            return ix.recordReceipt(getManifestProgram(), {
              authority: me,
              consignment,
              evidenceHash: fromHex(json.manifestHashHex),
              measuredCbmMilli: measured,
              cartonCount,
            });
          }}
          onSuccess={() => setStage(null)}
        >
          Upload evidence and record receipt
        </TxButton>
      </div>
    </details>
  );
}

function PickupScanner() {
  const toast = useToast();
  const [scanning, setScanning] = useState(false);
  const [pasted, setPasted] = useState("");
  const [result, setResult] = useState<PickupCheck | null>(null);

  const check = useCallback(
    async (text: string) => {
      setScanning(false);
      try {
        setResult(await verifyPickupPayload(getManifestProgram(), JSON.parse(text)));
      } catch {
        toast({ kind: "error", title: "That isn't a Manifest pickup code." });
      }
    },
    [toast],
  );

  return (
    <Card>
      <h2 className="mb-2 text-xl font-semibold">Pickup scanner</h2>
      <p className="mb-3 text-sm text-ink-muted">
        Scan the code on the trader&apos;s phone to check they hold the Cargo Ticket.
      </p>
      {scanning ? (
        <QrScanner onResult={check} />
      ) : (
        <Button
          variant="secondary"
          onClick={() => {
            setResult(null);
            setScanning(true);
          }}
        >
          Scan pickup code
        </Button>
      )}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer">Paste a code instead</summary>
        <textarea
          className={`${inputClass} mt-2 h-24 py-2 font-mono text-xs`}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <Button className="mt-2" variant="secondary" onClick={() => void check(pasted)}>
          Check code
        </Button>
      </details>
      {result && (
        <div
          role="status"
          className={`mt-4 rounded-lg border-2 p-4 ${result.ok ? "border-stamp" : "border-danger"}`}
        >
          {result.ok ? (
            <>
              <Stamp tone="stamp">Valid ticket</Stamp>
              <p className="mt-2 text-lg">
                Hand over <strong>{result.cartons} cartons</strong>: {result.description}
              </p>
              <p className="text-sm text-ink-muted">
                Holder {shortAddress(result.holder)}. They confirm pickup on their phone, which
                releases your freight.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-danger">Don&apos;t hand over goods</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {result.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
