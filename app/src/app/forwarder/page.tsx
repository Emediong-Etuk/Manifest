"use client";

import {
  decodeFixed,
  forwarderPda,
  formatUsd,
  isValidLocode,
  ix,
  LOCODES,
  nextContainerAddress,
  parseCbm,
  parseUsd,
} from "@manifest/sdk";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { MoneyInput } from "@/components/inputs";
import { ContainerCard, CoverageMeter, EmptyState, scoreLabel } from "@/components/manifest";
import { TxButton } from "@/components/tx-button";
import { Button, Card, Field, inputClass, PageShell, PageTitle, Skeleton } from "@/components/ui";
import {
  useConfigAccount,
  useContainers,
  useForwarder,
  useNow,
  useTokenBalance,
} from "@/hooks/queries";
import { getManifestProgram } from "@/lib/chain";
import { config } from "@/lib/config";
import { mintSymbol } from "@/lib/display";
import { useWallet } from "@/lib/wallet/context";

const nonEmpty = (keys: PublicKey[]) => keys.filter((k) => !k.equals(PublicKey.default));

export default function ForwarderPage() {
  const wallet = useWallet();
  const me = wallet.publicKey;
  const pda = me ? forwarderPda(me, config.programId) : null;
  const forwarder = useForwarder(pda);
  const configAccount = useConfigAccount();

  if (!wallet.ready || (me && forwarder.isLoading))
    return (
      <PageShell>
        <Skeleton className="h-64" />
      </PageShell>
    );
  if (!me || !pda) {
    return (
      <PageShell>
        <PageTitle title="For forwarders">
          <p className="text-lg">
            Post a guarantee once, then take bookings from traders who can finally trust you. Get
            paid freight automatically when they collect.
          </p>
        </PageTitle>
        <EmptyState
          title="Connect your wallet to open your forwarder account"
          illustration="empty-forwarder"
        >
          <Button className="mt-2" onClick={wallet.connect}>
            Connect wallet
          </Button>
        </EmptyState>
      </PageShell>
    );
  }
  if (!forwarder.data)
    return <Register bondMints={nonEmpty(configAccount.data?.bondMints ?? [])} />;
  return <Dashboard pda={pda} me={me} />;
}

function Register({ bondMints }: { bondMints: PublicKey[] }) {
  const wallet = useWallet();
  const [name, setName] = useState("");
  const [mint, setMint] = useState(bondMints[0]?.toBase58() ?? "");
  const bytes = new TextEncoder().encode(name).length;
  return (
    <PageShell>
      <PageTitle title="Register as a forwarder">
        <p className="text-ink-muted">
          Your name and track record are public. Your guarantee is held by the Manifest program, not
          by us.
        </p>
      </PageTitle>
      <Card>
        <div className="flex flex-col gap-4">
          <Field
            label="Company name"
            hint={`${bytes}/32`}
            error={bytes > 32 ? "Keep it under 32 characters" : null}
          >
            {(id) => (
              <input
                id={id}
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
          <Field label="Guarantee currency">
            {(id) => (
              <select
                id={id}
                className={inputClass}
                value={mint}
                onChange={(e) => setMint(e.target.value)}
              >
                {bondMints.map((m) => (
                  <option key={m.toBase58()} value={m.toBase58()}>
                    {mintSymbol(m)} ({m.toBase58().slice(0, 4)}…)
                  </option>
                ))}
              </select>
            )}
          </Field>
          <TxButton
            disabled={bytes === 0 || bytes > 32 || !mint}
            success="Forwarder account created. Now post your guarantee."
            build={async () => {
              if (!wallet.publicKey) throw new Error("Connect a wallet");
              return ix.registerForwarder(getManifestProgram(), {
                authority: wallet.publicKey,
                name,
                bondMint: new PublicKey(mint),
              });
            }}
          >
            Create forwarder account
          </TxButton>
        </div>
      </Card>
    </PageShell>
  );
}

function Dashboard({ pda, me }: { pda: PublicKey; me: PublicKey }) {
  const forwarder = useForwarder(pda);
  const containers = useContainers({ forwarder: pda });
  const configAccount = useConfigAccount();
  const coveragePct = (configAccount.data?.coverageBps ?? 0) / 100;
  const f = forwarder.data;
  const balance = useTokenBalance(me, f?.bondMint ?? null);
  const [deposit, setDeposit] = useState<{ raw: string; base: bigint | null }>({
    raw: "",
    base: null,
  });
  const [withdraw, setWithdraw] = useState<{ raw: string; base: bigint | null }>({
    raw: "",
    base: null,
  });
  if (!f) return null;
  const free = BigInt(f.bondBalance.toString()) - BigInt(f.lockedCoverage.toString());
  const program = getManifestProgram();
  const list = (containers.data ?? []).sort((a, b) => b.account.index - a.account.index);

  return (
    <PageShell wide>
      <PageTitle title={decodeFixed(f.name)}>
        <p className="text-ink-muted">
          {scoreLabel(f)} ·{" "}
          <Link className="underline" href={`/f/${pda.toBase58()}`}>
            Public profile
          </Link>
        </p>
      </PageTitle>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="text-xl font-semibold">Your guarantee</h2>
          <p className="mb-3 font-stencil text-4xl">{formatUsd(f.bondBalance)}</p>
          <CoverageMeter forwarder={f} />
          <p className="mt-2 text-sm text-ink-muted">
            Each booking locks {coveragePct}% of its goods value. Free to withdraw:{" "}
            {formatUsd(free)}. Wallet balance: {formatUsd(balance.data ?? 0n)}{" "}
            {mintSymbol(f.bondMint)}.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <MoneyInput
              label="Add to guarantee"
              value={deposit.raw}
              onChange={(raw, base) => setDeposit({ raw, base })}
            />
            <TxButton
              disabled={!deposit.base || deposit.base <= 0n}
              success="Guarantee increased."
              build={() => ix.depositBond(program, { authority: me, amount: deposit.base ?? 0n })}
              onSuccess={() => setDeposit({ raw: "", base: null })}
            >
              Deposit
            </TxButton>
            <details>
              <summary className="cursor-pointer text-sm font-semibold">Withdraw</summary>
              <div className="mt-3 flex flex-col gap-3">
                <MoneyInput
                  label="Withdraw amount"
                  value={withdraw.raw}
                  onChange={(raw, base) => setWithdraw({ raw, base })}
                />
                <TxButton
                  variant="secondary"
                  disabled={!withdraw.base || withdraw.base <= 0n || withdraw.base > free}
                  success="Withdrawn from guarantee."
                  build={() =>
                    ix.withdrawBond(program, { authority: me, amount: withdraw.base ?? 0n })
                  }
                  onSuccess={() => setWithdraw({ raw: "", base: null })}
                >
                  Withdraw
                </TxButton>
              </div>
            </details>
          </div>
        </Card>
        <OpenContainerForm me={me} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold">Your containers</h2>
        {list.length === 0 ? (
          <EmptyState title="No containers yet" illustration="empty-containers">
            Open your first one above.
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {list.map((c) => (
              <div key={c.address.toBase58()} className="flex flex-col gap-2">
                <ContainerCard address={c.address.toBase58()} container={c.account} forwarder={f} />
                <Link
                  className="text-sm font-semibold text-accent underline"
                  href={`/forwarder/c/${c.address.toBase58()}`}
                >
                  Manage {decodeFixed(c.account.code)} →
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}

const toInputDate = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

function OpenContainerForm({ me }: { me: PublicKey }) {
  const configAccount = useConfigAccount();
  const router = useRouter();
  const target = useRef<string | null>(null);
  const mints = nonEmpty(configAccount.data?.paymentMints ?? []);
  const now = useNow();
  const [form, setForm] = useState(() => ({
    code: "",
    origin: "CNCAN",
    destination: "NGAPP",
    mode: "sea" as "sea" | "air",
    capacity: "28",
    rate: "380",
    cutoff: toInputDate(new Date(Date.now() + 10 * 86_400_000)),
    eta: toInputDate(new Date(Date.now() + 50 * 86_400_000)),
    mint: "",
  }));
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });
  const mint = form.mint || mints[0]?.toBase58() || "";
  const codeBytes = new TextEncoder().encode(form.code).length;
  let capacity = 0;
  let rate = 0n;
  try {
    capacity = parseCbm(form.capacity);
    rate = parseUsd(form.rate);
  } catch {
    // shown as invalid below
  }
  const cutoffTs = Math.floor(new Date(form.cutoff).getTime() / 1000);
  const etaTs = Math.floor(new Date(form.eta).getTime() / 1000);
  const valid =
    codeBytes > 0 &&
    codeBytes <= 12 &&
    isValidLocode(form.origin) &&
    isValidLocode(form.destination) &&
    form.origin !== form.destination &&
    capacity > 0 &&
    rate > 0n &&
    cutoffTs > now &&
    etaTs > cutoffTs &&
    Boolean(mint);
  const portSelect = (key: "origin" | "destination", label: string) => (
    <Field label={label}>
      {(id) => (
        <select id={id} className={inputClass} value={form[key]} onChange={set(key)}>
          {Object.entries(LOCODES).map(([code, p]) => (
            <option key={code} value={code}>
              {p.city}, {p.country} ({code})
            </option>
          ))}
        </select>
      )}
    </Field>
  );

  return (
    <Card>
      <h2 className="mb-3 text-xl font-semibold">Open a container</h2>
      <div className="flex flex-col gap-3">
        <Field
          label="Container code"
          hint="Your reference, e.g. LAG-1014"
          error={codeBytes > 12 ? "12 characters max" : null}
        >
          {(id) => (
            <input id={id} className={inputClass} value={form.code} onChange={set("code")} />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {portSelect("origin", "From")}
          {portSelect("destination", "To")}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Mode">
            {(id) => (
              <select id={id} className={inputClass} value={form.mode} onChange={set("mode")}>
                <option value="sea">Sea</option>
                <option value="air">Air</option>
              </select>
            )}
          </Field>
          <Field label="Capacity (CBM)">
            {(id) => (
              <input
                id={id}
                inputMode="decimal"
                className={inputClass}
                value={form.capacity}
                onChange={set("capacity")}
              />
            )}
          </Field>
          <Field label="Rate ($/CBM)">
            {(id) => (
              <input
                id={id}
                inputMode="decimal"
                className={inputClass}
                value={form.rate}
                onChange={set("rate")}
              />
            )}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Booking cut-off">
            {(id) => (
              <input
                id={id}
                type="datetime-local"
                className={inputClass}
                value={form.cutoff}
                onChange={set("cutoff")}
              />
            )}
          </Field>
          <Field label="Expected arrival">
            {(id) => (
              <input
                id={id}
                type="datetime-local"
                className={inputClass}
                value={form.eta}
                onChange={set("eta")}
              />
            )}
          </Field>
        </div>
        {mints.length > 1 && (
          <Field label="Payment currency">
            {(id) => (
              <select id={id} className={inputClass} value={mint} onChange={set("mint")}>
                {mints.map((m) => (
                  <option key={m.toBase58()} value={m.toBase58()}>
                    {mintSymbol(m)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <TxButton
          disabled={!valid}
          success="Container open for bookings."
          build={async () => {
            const program = getManifestProgram();
            target.current = (await nextContainerAddress(program, me)).toBase58();
            return ix.openContainer(program, {
              authority: me,
              code: form.code,
              origin: form.origin,
              destination: form.destination,
              mode: form.mode,
              mint: new PublicKey(mint),
              capacityCbmMilli: capacity,
              ratePerCbm: rate,
              cutoffTs,
              etaTs,
            });
          }}
          onSuccess={() => target.current && router.push(`/forwarder/c/${target.current}`)}
        >
          Open container
        </TxButton>
      </div>
    </Card>
  );
}
