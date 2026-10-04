"use client";

import { type EvidenceManifest, formatCbm, toHex, verifyEvidence } from "@manifest/sdk";
import { useQuery } from "@tanstack/react-query";

import { Skeleton, Stamp } from "./ui";

interface EvidenceResponse {
  manifestUri: string;
  manifestJson: string;
  photoUrls: string[];
}

/** Evidence photos + packing list, re-hashed in the browser against the onchain hash. */
export function EvidenceGallery({
  consignment,
  onchainHash,
}: {
  consignment: string;
  onchainHash: number[];
}) {
  const evidence = useQuery({
    queryKey: ["evidence", consignment, toHex(onchainHash)],
    queryFn: async () => {
      const res = await fetch(`/api/evidence/${consignment}`);
      if (!res.ok) return null;
      const body = (await res.json()) as EvidenceResponse;
      const verified = await verifyEvidence(body.manifestJson, onchainHash);
      return { ...body, manifest: JSON.parse(body.manifestJson) as EvidenceManifest, verified };
    },
  });

  if (evidence.isLoading) return <Skeleton className="h-48" />;
  if (!evidence.data) {
    return (
      <p className="text-ink-muted">
        The evidence files couldn&apos;t be loaded. The hash onchain is{" "}
        {toHex(onchainHash).slice(0, 16)}…
      </p>
    );
  }
  const { manifest, photoUrls, verified } = evidence.data;
  return (
    <div className="flex flex-col gap-4">
      <HashBadge verified={verified} hash={toHex(onchainHash)} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {photoUrls.map((url, i) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-lg border-2 border-rule"
          >
            {/* Evidence comes from IPFS gateways or local storage; plain img avoids image-optimizer domain config. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Warehouse photo ${i + 1}`}
              className="aspect-square w-full object-cover"
              loading="lazy"
            />
          </a>
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-ink-muted">Measured volume</dt>
        <dd className="text-right font-medium">{formatCbm(manifest.measuredCbmMilli)}</dd>
        <dt className="text-ink-muted">Cartons</dt>
        <dd className="text-right font-medium">{manifest.cartonCount}</dd>
        <dt className="text-ink-muted">Recorded</dt>
        <dd className="text-right font-medium">{new Date(manifest.recordedAt).toLocaleString()}</dd>
      </dl>
      {manifest.packingList.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-muted">
              <th className="font-normal">Packing list</th>
              <th className="text-right font-normal">Qty</th>
            </tr>
          </thead>
          <tbody>
            {manifest.packingList.map((row, i) => (
              <tr key={i} className="border-t border-rule">
                <td className="py-1">{row.item}</td>
                <td className="py-1 text-right">{row.qty.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {manifest.notes && <p className="rounded-lg bg-paper p-3 text-sm">“{manifest.notes}”</p>}
    </div>
  );
}

export function HashBadge({ verified, hash }: { verified: boolean; hash: string }) {
  return verified ? (
    <div className="flex flex-wrap items-center gap-2">
      <Stamp tone="stamp">Verified</Stamp>
      <span className="text-sm">Matches the record on Solana</span>
      <span className="font-mono text-xs text-ink-muted" title={hash}>
        sha256 {hash.slice(0, 10)}…
      </span>
    </div>
  ) : (
    <div role="alert" className="rounded-lg border-2 border-danger p-3 text-sm">
      <p className="font-semibold text-danger">
        Warning: these files don&apos;t match the record on Solana.
      </p>
      <p className="text-ink-muted">Don&apos;t approve. Ask the forwarder, or open a dispute.</p>
    </div>
  );
}
