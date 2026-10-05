/**
 * Shipment page. The view is a client component (live chain reads and actions); this
 * server wrapper adds share metadata using the Cargo Ticket artwork. No goods value.
 */
import type { Metadata } from "next";

import { loadShipment, parseKey } from "@/server/og/data";
import { ticketFacts } from "@/server/og/ticket";

import { ShipmentView } from "./shipment-view";

type Props = { params: Promise<{ consignment: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { consignment } = await params;
  const key = parseKey(consignment);
  const data = key ? await loadShipment(key).catch(() => null) : null;
  if (!key || !data) return { title: "Shipment" };

  const t = ticketFacts(key, data);
  const title = `Shipment ${t.ticketNo}: ${t.stageLabel}`;
  const description = `${t.originCity} → ${t.destinationCity} by ${t.mode.toLowerCase()}. Status read from the Solana program: ${t.stageLabel}.`;
  const image = {
    url: `/api/tickets/${key.toBase58()}/image`,
    width: 1080,
    height: 1080,
    alt: t.name,
  };
  return {
    title,
    description,
    openGraph: { title, description, images: [image], type: "website" },
    twitter: { card: "summary", title, description, images: [image.url] },
  };
}

export default function ShipmentPage() {
  return <ShipmentView />;
}
