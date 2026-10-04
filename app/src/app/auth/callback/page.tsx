"use client";

/**
 * Phantom Connect OAuth return page (Google / Apple). Must be allow-listed in Phantom
 * Portal. The Phantom SDK (mounted app-wide) completes the sign-in from the URL; this page
 * waits for the wallet and sends the user back where they started.
 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Spinner } from "@/components/ui";
import { useWallet } from "@/lib/wallet/context";

const RETURN_KEY = "manifest.returnTo";

export default function AuthCallback() {
  const wallet = useWallet();
  const router = useRouter();
  useEffect(() => {
    if (!wallet.publicKey) return;
    let target = "/";
    try {
      target = window.sessionStorage.getItem(RETURN_KEY) || "/";
      window.sessionStorage.removeItem(RETURN_KEY);
    } catch {
      // storage unavailable
    }
    router.replace(target);
  }, [wallet.publicKey, router]);

  return (
    <main className="mx-auto flex min-h-[50dvh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-stencil text-3xl uppercase">Signing you in</h1>
      <Spinner label="Finishing sign-in with Phantom…" />
    </main>
  );
}
