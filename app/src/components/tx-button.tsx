"use client";

/**
 * One user action = one transaction. States: idle → building/awaiting signature →
 * confirming → success (toast + explorer link) or error (friendly message + details).
 */
import type { TransactionInstruction } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { sendInstructions, TxError, type TxResult } from "@/lib/tx";
import { useWallet } from "@/lib/wallet/context";

import { useToast } from "./toasts";
import { Button } from "./ui";

type Phase = "idle" | "signing" | "error";

export function TxButton({
  build,
  children,
  success,
  onSuccess,
  disabled,
  variant = "primary",
  className = "",
}: {
  build: () => Promise<TransactionInstruction[]>;
  children: ReactNode;
  success: string;
  onSuccess?: (result: TxResult) => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const wallet = useWallet();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<TxError | null>(null);

  if (!wallet.publicKey) {
    return (
      <Button variant="secondary" onClick={wallet.connect} className={className}>
        Connect wallet to continue
      </Button>
    );
  }

  const run = async () => {
    setPhase("signing");
    setError(null);
    try {
      const result = await sendInstructions(wallet, await build());
      setPhase("idle");
      toast({ kind: "success", title: success, href: result.explorer });
      await queryClient.invalidateQueries();
      onSuccess?.(result);
    } catch (err) {
      const e =
        err instanceof TxError
          ? err
          : new TxError("Something went wrong. Please try again.", String(err));
      setError(e);
      setPhase("error");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant={variant}
        onClick={run}
        disabled={disabled || phase === "signing"}
        className={className}
      >
        {phase === "signing" ? "Confirm in your wallet…" : children}
      </Button>
      {phase === "error" && error && (
        <div role="alert" className="rounded-lg border-2 border-danger p-3 text-sm">
          <p className="font-semibold text-danger">{error.message}</p>
          <details className="mt-1 text-ink-muted">
            <summary className="cursor-pointer">Details</summary>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-xs">
              {error.detail}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
