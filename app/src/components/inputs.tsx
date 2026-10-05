"use client";

import { cbmFromCartons, formatCbm, parseCbm, parseUsd, shortAddress } from "@manifest/sdk";
import { PublicKey } from "@solana/web3.js";
import { useMemo, useState } from "react";

import { Field, inputClass } from "./ui";

/** Dollar amount input; reports base units (or null when invalid/empty). */
export function MoneyInput({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (raw: string, baseUnits: bigint | null) => void;
}) {
  const error = useMemo(() => {
    if (!value) return null;
    try {
      parseUsd(value);
      return null;
    } catch {
      return "Enter an amount like 2400 or 2,400.50";
    }
  }, [value]);
  return (
    <Field label={label} hint={hint} error={error}>
      {(id) => (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
            $
          </span>
          <input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            className={`${inputClass} pl-7`}
            value={value}
            onChange={(e) => {
              const raw = e.target.value;
              let base: bigint | null = null;
              try {
                base = raw ? parseUsd(raw) : null;
              } catch {
                base = null;
              }
              onChange(raw, base);
            }}
          />
        </div>
      )}
    </Field>
  );
}

export function parsePubkey(value: string): PublicKey | null {
  try {
    return new PublicKey(value.trim());
  } catch {
    return null;
  }
}

/**
 * Wallet address input with the confirm-last-4 pattern: the address is shown large
 * (first and last 4 characters) and the user re-types the last 4 to confirm.
 * Wrong-address loss is the biggest real-world risk, so this is deliberate friction.
 */
export function AddressInput({
  label,
  hint,
  value,
  onChange,
  confirmed,
  onConfirmedChange,
  forbidden = [],
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  confirmed: boolean;
  onConfirmedChange: (ok: boolean) => void;
  forbidden?: { key: PublicKey | null; reason: string }[];
}) {
  const [check, setCheck] = useState("");
  const key = parsePubkey(value);
  const forbiddenHit = key ? forbidden.find((f) => f.key?.equals(key)) : undefined;
  const error = !value
    ? null
    : !key
      ? "That isn't a valid Solana address."
      : forbiddenHit
        ? forbiddenHit.reason
        : null;
  const last4 = key?.toBase58().slice(-4) ?? "";

  return (
    <div className="flex flex-col gap-3">
      <Field label={label} hint={hint} error={error}>
        {(id) => (
          <input
            id={id}
            autoComplete="off"
            spellCheck={false}
            className={`${inputClass} font-mono text-sm`}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setCheck("");
              onConfirmedChange(false);
            }}
          />
        )}
      </Field>
      {key && !error && (
        <div className="rounded-lg border-2 border-accent bg-paper p-3">
          <p className="text-sm text-ink-muted">Check this is the right address:</p>
          <p className="font-mono text-2xl tracking-wider">
            <strong>{key.toBase58().slice(0, 4)}</strong>
            <span className="text-ink-muted">…</span>
            <strong>{last4}</strong>
          </p>
          <Field
            label="Type the last 4 characters to confirm"
            error={
              check.length === 4 && check !== last4
                ? "Doesn't match. Check the address again."
                : null
            }
          >
            {(id) => (
              <input
                id={id}
                maxLength={4}
                autoComplete="off"
                spellCheck={false}
                className={`${inputClass} w-32 font-mono text-lg tracking-widest`}
                value={check}
                onChange={(e) => {
                  setCheck(e.target.value);
                  onConfirmedChange(e.target.value === last4);
                }}
              />
            )}
          </Field>
          {confirmed && (
            <p className="text-sm font-medium text-stamp">
              ✓ Confirmed {shortAddress(key.toBase58())}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** L × W × H (cm) × cartons → CBM. */
export function CbmCalculator({ onUse }: { onUse: (milli: number) => void }) {
  const [dims, setDims] = useState({ l: "", w: "", h: "", n: "" });
  const nums = [dims.l, dims.w, dims.h, dims.n].map(Number);
  const valid = nums.every((n) => Number.isFinite(n) && n > 0);
  const milli = valid ? cbmFromCartons(nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0, nums[3] ?? 0) : 0;
  const field = (key: keyof typeof dims, label: string) => (
    <Field label={label}>
      {(id) => (
        <input
          id={id}
          inputMode="numeric"
          className={inputClass}
          value={dims[key]}
          onChange={(e) => setDims({ ...dims, [key]: e.target.value })}
        />
      )}
    </Field>
  );
  return (
    <div className="flex flex-col gap-3 rounded-lg border-2 border-dashed border-rule p-3">
      <p className="font-semibold">CBM calculator</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {field("l", "Length (cm)")}
        {field("w", "Width (cm)")}
        {field("h", "Height (cm)")}
        {field("n", "Cartons")}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p>{valid ? <strong>{formatCbm(milli)}</strong> : "Enter carton size and count"}</p>
        <button
          type="button"
          disabled={!valid}
          onClick={() => onUse(milli)}
          className="min-h-12 rounded-lg border-2 border-ink px-4 font-semibold disabled:opacity-40"
        >
          Use this volume
        </button>
      </div>
    </div>
  );
}

export function CbmInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (raw: string, milli: number | null) => void;
}) {
  let error: string | null = null;
  if (value) {
    try {
      if (parseCbm(value) <= 0) error = "Volume must be more than 0";
    } catch {
      error = "Enter a volume like 1.25";
    }
  }
  return (
    <Field
      label="Estimated volume (CBM)"
      hint="Final freight is charged on the volume measured at the warehouse."
      error={error}
    >
      {(id) => (
        <input
          id={id}
          inputMode="decimal"
          className={inputClass}
          value={value}
          onChange={(e) => {
            let milli: number | null = null;
            try {
              milli = e.target.value ? parseCbm(e.target.value) : null;
            } catch {
              milli = null;
            }
            onChange(e.target.value, milli);
          }}
        />
      )}
    </Field>
  );
}
