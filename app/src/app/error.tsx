"use client";

/**
 * Error boundary for every page (Next 16 passes `retry`, see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md).
 */
import Link from "next/link";
import { useEffect } from "react";

import { Button, PageShell, PageTitle } from "@/components/ui";

export default function PageError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageShell>
      <PageTitle title="Something went wrong">
        <p className="text-ink-muted">
          This page hit an error. Your money is safe: everything is held by the Solana program, not
          by this website.
        </p>
      </PageTitle>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => retry()}>Try again</Button>
        <Link
          href="/"
          className="inline-flex min-h-12 items-center rounded-lg border-2 border-ink px-5 font-semibold"
        >
          Go home
        </Link>
      </div>
      {error.digest && <p className="text-sm text-ink-muted">Error reference: {error.digest}</p>}
    </PageShell>
  );
}
