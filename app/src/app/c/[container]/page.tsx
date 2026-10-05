/**
 * Container page. The view is a client component (live chain reads); this server wrapper
 * adds share metadata so WhatsApp / X previews show the route, space left and the OG image
 * from /api/og/container/[container].
 */
import { decodeFixed, formatCbm, formatCountdown, formatUsd, locodeCity } from "@manifest/sdk";
import type { Metadata } from "next";

import { loadContainer, parseKey, scoreText } from "@/server/og/data";

import { ContainerView } from "./container-view";

type Props = { params: Promise<{ container: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { container } = await params;
  const key = parseKey(container);
  const data = key ? await loadContainer(key).catch(() => null) : null;
  if (!key || !data) return { title: "Container" };

  const { container: c, forwarder: f } = data;
  const code = decodeFixed(c.code);
  const route = `${locodeCity(decodeFixed(c.origin))} → ${locodeCity(decodeFixed(c.destination))}`;
  const cutoffIn = c.cutoffTs.toNumber() - Math.floor(Date.now() / 1000);
  const title = `${code}: ${route}`;
  const description = [
    `${formatCbm(Math.max(0, c.capacityCbmMilli - c.bookedCbmMilli))} left at ${formatUsd(c.ratePerCbm)}/CBM.`,
    cutoffIn > 0 ? `Cut-off in ${formatCountdown(cutoffIn)}.` : "Booking closed.",
    f ? `Forwarder ${decodeFixed(f.name)} (${scoreText(f)}).` : "",
    "Your money stays locked until your goods are checked at the warehouse.",
  ]
    .filter(Boolean)
    .join(" ");
  const image = {
    url: `/api/og/container/${key.toBase58()}`,
    width: 1200,
    height: 630,
    alt: `Container ${title}`,
  };
  return {
    title,
    description,
    openGraph: { title, description, images: [image], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default function ContainerPage() {
  return <ContainerView />;
}
