"use client";

/** Base design-system pieces: "the shipping manifest" look (paper, ink, container orange). */
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-110 border-accent",
  secondary: "bg-paper-raised text-ink border-ink hover:bg-paper",
  ghost: "bg-transparent text-ink border-transparent hover:border-rule",
  danger: "bg-paper-raised text-danger border-danger hover:bg-paper",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border-2 px-5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border-2 border-rule bg-paper-raised p-4 sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

const STAMP_TONES = {
  accent: "border-accent text-accent",
  stamp: "border-stamp text-stamp",
  ink: "border-ink text-ink",
  danger: "border-danger text-danger",
  muted: "border-ink-muted text-ink-muted",
} as const;

/** Rubber-stamp status badge: "PAID SUPPLIER", "COLLECTED"... */
export function Stamp({
  children,
  tone = "accent",
  tilt = true,
}: {
  children: ReactNode;
  tone?: keyof typeof STAMP_TONES;
  tilt?: boolean;
}) {
  return (
    <span
      className={`inline-block border-2 px-2 py-0.5 font-stencil text-sm uppercase tracking-widest ${STAMP_TONES[tone]} ${
        tilt ? "-rotate-2" : ""
      }`}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="text-sm text-ink-muted">{hint}</p>}
      {error && (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "min-h-12 w-full rounded-lg border-2 border-rule bg-paper px-3 text-base text-ink placeholder:text-ink-muted/70 focus:border-accent";

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-ink-muted">
      <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {label}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-rule/50 ${className}`} />;
}

/** Bottom sheet on phones, centered dialog on larger screens. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-0 mt-auto w-full max-w-none rounded-t-2xl border-2 border-ink bg-paper-raised p-0 text-ink backdrop:bg-ink/60 sm:m-auto sm:max-w-lg sm:rounded-2xl"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-stencil text-2xl uppercase tracking-wide">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-12 items-center justify-center rounded-lg text-2xl text-ink-muted hover:bg-paper"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function PageShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <main
      className={`mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:py-10 ${wide ? "max-w-5xl" : "max-w-2xl"}`}
    >
      {children}
    </main>
  );
}

export function PageTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2">
      {eyebrow && <div className="font-mono text-sm text-ink-muted">{eyebrow}</div>}
      <h1 className="font-stencil text-4xl uppercase leading-none tracking-wide sm:text-5xl">
        {title}
      </h1>
      {children}
    </header>
  );
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-ink-muted">{k}</dt>
          <dd className="text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ErrorNote({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border-2 border-danger bg-paper-raised p-4">
      <p className="font-semibold text-danger">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-muted">{children}</div>}
    </div>
  );
}
