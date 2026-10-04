"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  title: string;
  body?: string;
  href?: string;
}

const ToastContext = createContext<(t: Omit<Toast, "id">) => void>(() => undefined);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all, { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 8_000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 mx-auto flex max-w-md flex-col gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto rounded-lg border-2 bg-paper-raised p-3 shadow-lg ${
              t.kind === "success"
                ? "border-stamp"
                : t.kind === "error"
                  ? "border-danger"
                  : "border-ink"
            }`}
          >
            <p className="font-semibold">{t.title}</p>
            {t.body && <p className="text-sm text-ink-muted">{t.body}</p>}
            {t.href && (
              <a
                className="text-sm font-medium text-accent underline"
                href={t.href}
                target="_blank"
                rel="noreferrer"
              >
                View on Solana Explorer
              </a>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
