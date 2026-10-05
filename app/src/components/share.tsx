"use client";

import { useState } from "react";

import { config } from "@/lib/config";

import { Button, Card } from "./ui";

/**
 * Blink link for the container's Solana Action, opened through dial.to. Format from
 * @solana/actions BLINKS_QUERY_PARAM: https://dial.to/?action=solana-action:<action URL>.
 */
export function blinkUrl(container: string): string {
  const action = `${config.appUrl}/api/actions/book/${container}`;
  const cluster = config.cluster === "mainnet-beta" ? "mainnet" : "devnet";
  return `https://dial.to/?action=${encodeURIComponent(`solana-action:${action}`)}&cluster=${cluster}`;
}

export function ShareContainer({
  container,
  text,
  title = "Share this container",
}: {
  container: string;
  text: string;
  title?: string;
}) {
  const [copied, setCopied] = useState<"link" | "blink" | null>(null);
  const url = `${config.appUrl}/c/${container}`;
  const copy = (value: string, which: "link" | "blink") =>
    void navigator.clipboard.writeText(value).then(() => setCopied(which));

  return (
    <Card>
      <p className="mb-3 font-semibold">{title}</p>
      <div className="flex flex-wrap gap-2">
        <a
          className="inline-flex min-h-12 items-center rounded-lg border-2 border-stamp px-4 font-semibold text-stamp"
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noreferrer"
        >
          WhatsApp
        </a>
        <a
          className="inline-flex min-h-12 items-center rounded-lg border-2 border-ink px-4 font-semibold"
          href={`https://x.com/intent/post?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noreferrer"
        >
          Post on X
        </a>
        <Button variant="secondary" onClick={() => copy(url, "link")}>
          {copied === "link" ? "Link copied" : "Copy link"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => copy(blinkUrl(container), "blink")}
          title="A Solana Blink: traders can book straight from X or any Blink-enabled wallet"
        >
          {copied === "blink" ? "Blink copied" : "Share as Blink"}
        </Button>
      </div>
      <p className="mt-2 text-sm text-ink-muted">
        WhatsApp shows a preview card. The Blink lets people book from X and Blink-enabled wallets.
      </p>
    </Card>
  );
}
