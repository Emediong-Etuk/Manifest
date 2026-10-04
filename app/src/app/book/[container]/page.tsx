"use client";

/**
 * Booking stepper: (1) goods value + description, (2) volume with CBM calculator,
 * (3) supplier payout address (confirm last 4), (4) summary of what gets locked, (5) sign.
 */
import {
  containerStatus,
  decodeFixed,
  formatCbm,
  formatUsd,
  ix,
  locodeCity,
  nextConsignmentAddressFor,
  quoteBooking,
} from "@manifest/sdk";
import { useRouter, useParams } from "next/navigation";
import { useRef, useState } from "react";

import {
  AddressInput,
  CbmCalculator,
  CbmInput,
  MoneyInput,
  parsePubkey,
} from "@/components/inputs";
import { EmptyState, RouteLine } from "@/components/manifest";
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
} from "@/components/ui";
import {
  useConfigAccount,
  useContainer,
  useNow,
  usePubkeyParam,
  useTokenBalance,
} from "@/hooks/queries";
import { getManifestProgram } from "@/lib/chain";
import { mintSymbol } from "@/lib/display";
import { useWallet } from "@/lib/wallet/context";

const STEPS = ["Goods", "Volume", "Supplier", "Summary"] as const;
const EMBEDDED_DAILY_LIMIT = 1_000_000_000n; // $1,000: Phantom embedded-wallet daily limit

export default function BookPage() {
  const params = useParams<{ container: string }>();
  const address = usePubkeyParam(params.container);
  const container = useContainer(address);
  const configAccount = useConfigAccount();
  const wallet = useWallet();
  const balance = useTokenBalance(wallet.publicKey, container.data?.mint ?? null);
  const router = useRouter();
  const now = useNow();

  const [step, setStep] = useState(0);
  const [goodsRaw, setGoodsRaw] = useState("");
  const [goods, setGoods] = useState<bigint | null>(null);
  const [description, setDescription] = useState("");
  const [cbmRaw, setCbmRaw] = useState("");
  const [cbm, setCbm] = useState<number | null>(null);
  const [payeeRaw, setPayeeRaw] = useState("");
  const [payeeConfirmed, setPayeeConfirmed] = useState(false);
  const target = useRef<string | null>(null);

  if (!address)
    return (
      <PageShell>
        <EmptyState title="That container link isn't valid." />
      </PageShell>
    );
  if (container.isLoading || configAccount.isLoading)
    return (
      <PageShell>
        <Skeleton className="h-96" />
      </PageShell>
    );
  const c = container.data;
  const cfg = configAccount.data;
  if (!c || !cfg)
    return (
      <PageShell>
        <EmptyState title="Container not found" illustration="not-found" />
      </PageShell>
    );

  const open = containerStatus(c) === "open" && c.cutoffTs.toNumber() > now;
  const symbol = mintSymbol(c.mint);
  const left = c.capacityCbmMilli - c.bookedCbmMilli;
  const descBytes = new TextEncoder().encode(description).length;
  const payee = parsePubkey(payeeRaw);
  const quote =
    goods !== null && cbm !== null
      ? quoteBooking({
          goods,
          estCbmMilli: cbm,
          ratePerCbm: BigInt(c.ratePerCbm.toString()),
          feeBps: cfg.feeBps,
          freightBufferBps: cfg.freightBufferBps,
          coverageBps: cfg.coverageBps,
        })
      : null;

  const stepValid = [
    goods !== null && goods > 0n && descBytes > 0 && descBytes <= 64,
    cbm !== null && cbm > 0 && cbm <= left,
    payee !== null && payeeConfirmed,
    quote !== null && (balance.data ?? 0n) >= quote.total,
  ];

  if (!open) {
    return (
      <PageShell>
        <EmptyState
          title="This container is no longer taking bookings."
          illustration="empty-containers"
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageTitle
        eyebrow={
          <RouteLine origin={decodeFixed(c.origin)} destination={decodeFixed(c.destination)} />
        }
        title={`Book ${decodeFixed(c.code)}`}
      >
        <ol className="flex flex-wrap gap-1.5 text-xs sm:text-sm" aria-label="Booking steps">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className={`whitespace-nowrap rounded-full border px-2.5 py-1 ${i === step ? "border-accent font-semibold text-accent" : i < step ? "border-stamp text-stamp" : "border-rule text-ink-muted"}`}
            >
              {i + 1}. {s}
            </li>
          ))}
        </ol>
      </PageTitle>

      <Card>
        <div className="flex flex-col gap-5">
          {step === 0 && (
            <>
              <MoneyInput
                label="Goods value"
                hint="What you're paying your supplier. Paid only after you approve the warehouse photos."
                value={goodsRaw}
                onChange={(raw, base) => {
                  setGoodsRaw(raw);
                  setGoods(base);
                }}
              />
              <Field
                label="What are you shipping?"
                hint={`Short description for the forwarder, e.g. "Phone cases, 12 cartons". ${descBytes}/64`}
                error={descBytes > 64 ? "Keep it under 64 characters" : null}
              >
                {(id) => (
                  <input
                    id={id}
                    className={inputClass}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                )}
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <CbmInput
                value={cbmRaw}
                onChange={(raw, milli) => {
                  setCbmRaw(raw);
                  setCbm(milli);
                }}
              />
              {cbm !== null && cbm > left && (
                <p className="text-sm text-danger">
                  Only {formatCbm(left)} left in this container.
                </p>
              )}
              <CbmCalculator
                onUse={(milli) => {
                  setCbm(milli);
                  setCbmRaw(String(milli / 1000));
                }}
              />
            </>
          )}

          {step === 2 && (
            <AddressInput
              label="Supplier's payout address"
              hint="The Solana wallet of your supplier or China agent. They receive the goods payment when you approve."
              value={payeeRaw}
              onChange={setPayeeRaw}
              confirmed={payeeConfirmed}
              onConfirmedChange={setPayeeConfirmed}
              forbidden={[
                {
                  key: wallet.publicKey,
                  reason: "That's your own wallet. Enter your supplier's address.",
                },
                { key: cfg.treasuryOwner, reason: "That address can't receive supplier payments." },
              ]}
            />
          )}

          {step === 3 && quote && (
            <>
              <KeyValue
                items={[
                  ["Goods (to supplier on approval)", formatUsd(quote.goods)],
                  [`Manifest fee (${cfg.feeBps / 100}%)`, formatUsd(quote.fee)],
                  [
                    `Estimated freight + ${cfg.freightBufferBps / 100}% buffer`,
                    formatUsd(quote.freightEscrowed),
                  ],
                  [
                    <strong key="t">Total locked</strong>,
                    <strong key="v">
                      {formatUsd(quote.total)}{" "}
                      <small className="font-normal text-ink-muted">{symbol}</small>
                    </strong>,
                  ],
                ]}
              />
              <p className="text-sm text-ink-muted">
                Locked safely in Manifest. The freight buffer above the measured volume comes back
                to you when you approve. Your supplier (
                {payee ? `${payee.toBase58().slice(0, 4)}…${payee.toBase58().slice(-4)}` : ""}) is
                paid only after you approve the photos.
              </p>
              <p className="text-sm">
                Your balance: <strong>{formatUsd(balance.data ?? 0n)}</strong> {symbol}
                {(balance.data ?? 0n) < quote.total && (
                  <span className="text-danger"> · not enough for this booking</span>
                )}
              </p>
              {wallet.embedded && quote.total > EMBEDDED_DAILY_LIMIT && (
                <p className="rounded-lg border-2 border-accent p-3 text-sm">
                  Wallets created with Google or Apple sign-in can send up to $1,000 a day through
                  Manifest. For bigger bookings, connect the Phantom app or browser extension.
                </p>
              )}
            </>
          )}

          <div className="flex flex-wrap justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              Back
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!stepValid[step]}>
                Next
              </Button>
            ) : (
              <TxButton
                disabled={!stepValid[3] || !wallet.publicKey}
                success={`Booked: ${formatUsd(quote?.total ?? 0n)} locked safely in Manifest`}
                build={async () => {
                  if (!wallet.publicKey || goods === null || cbm === null || !payee)
                    throw new Error("Incomplete booking");
                  const program = getManifestProgram();
                  target.current = (await nextConsignmentAddressFor(program, address)).toBase58();
                  return ix.bookConsignment(program, {
                    trader: wallet.publicKey,
                    container: address,
                    goodsAmount: goods,
                    estCbmMilli: cbm,
                    payee,
                    description,
                  });
                }}
                onSuccess={() => target.current && router.push(`/s/${target.current}`)}
              >
                Lock {quote ? formatUsd(quote.total) : ""} and book
              </TxButton>
            )}
          </div>
          <p className="text-sm text-ink-muted">
            Route: {locodeCity(decodeFixed(c.origin))} → {locodeCity(decodeFixed(c.destination))} ·
            Rate {formatUsd(c.ratePerCbm)}/CBM
          </p>
        </div>
      </Card>
    </PageShell>
  );
}
