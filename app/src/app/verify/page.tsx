"use client";

/**
 * Due diligence for buyers of goods in transit: paste a shipment address, a Cargo Ticket
 * mint or an ISO 6346 container number and see the onchain status.
 */
import { decodeFixed, listConsignments, listContainers } from "@manifest/sdk";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useState } from "react";

import { Button, Card, Field, inputClass, PageShell, PageTitle } from "@/components/ui";
import { getManifestProgram } from "@/lib/chain";

type Hit = { kind: "shipment" | "container"; href: string; label: string };

async function search(query: string): Promise<Hit[]> {
  const q = query.trim();
  const program = getManifestProgram();
  if (/^[A-Z]{4}\d{7}$/i.test(q)) {
    const containers = await listContainers(program);
    return containers
      .filter((c) => decodeFixed(c.account.containerNumber).toUpperCase() === q.toUpperCase())
      .map((c) => ({
        kind: "container",
        href: `/c/${c.address.toBase58()}`,
        label: `Container ${decodeFixed(c.account.code)} (${q.toUpperCase()})`,
      }));
  }
  let key: PublicKey;
  try {
    key = new PublicKey(q);
  } catch {
    return [];
  }
  if (await program.account.consignment.fetchNullable(key)) {
    return [{ kind: "shipment", href: `/s/${key.toBase58()}`, label: "Shipment" }];
  }
  if (await program.account.container.fetchNullable(key)) {
    return [{ kind: "container", href: `/c/${key.toBase58()}`, label: "Container" }];
  }
  const byTicket = (await listConsignments(program)).filter((c) =>
    c.account.cargoTicketMint.equals(key),
  );
  return byTicket.map((c) => ({
    kind: "shipment",
    href: `/s/${c.address.toBase58()}`,
    label: "Shipment for this Cargo Ticket",
  }));
}

export default function VerifyPage() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <PageShell>
      <PageTitle title="Verify a shipment">
        <p className="text-ink-muted">
          Buying goods that are still at sea? Check the Cargo Ticket first: status, warehouse
          evidence and who holds it.
        </p>
      </PageTitle>
      <Card>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              setHits(await search(query));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field
            label="Shipment address, Cargo Ticket address, or container number"
            hint="e.g. CSQU3054383"
          >
            {(id) => (
              <input
                id={id}
                className={`${inputClass} font-mono text-sm`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" disabled={!query.trim() || busy}>
            {busy ? "Searching…" : "Verify"}
          </Button>
        </form>
      </Card>
      {hits && (
        <Card>
          {hits.length === 0 ? (
            <p>Nothing on Manifest matches that.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {hits.map((h) => (
                <li key={h.href}>
                  <Link className="font-semibold text-accent underline" href={h.href}>
                    {h.label} →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </PageShell>
  );
}
