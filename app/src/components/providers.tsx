"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";

import { config } from "@/lib/config";
import { WalletContext } from "@/lib/wallet/context";
import { DISCONNECTED, type ManifestWallet } from "@/lib/wallet/types";

import { ToastProvider } from "./toasts";

// Wallet SDKs are browser-only and heavy: load them lazily, beside the app rather than
// around it, so every page still renders on the server.
const PhantomWallet = dynamic(() => import("@/lib/wallet/phantom"), { ssr: false });
const BurnerWallet = dynamic(() => import("@/lib/wallet/burner"), { ssr: false });

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, retry: 1 } } }),
  );
  const [wallet, setWallet] = useState<ManifestWallet>(DISCONNECTED);
  const Host = config.burnerWallet ? BurnerWallet : PhantomWallet;
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Host onChange={setWallet} />
        <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
