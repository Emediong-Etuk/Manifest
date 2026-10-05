/**
 * GET /api/tickets/[consignment]: Cargo Ticket metadata, the `uri` the program writes into
 * each ticket mint (config.metadata_base_uri + consignment address). Metaplex-style JSON
 * (https://metaplex.com/docs/token-metadata/token-standard) so wallets show the
 * name, image and attributes. Read live from the chain; never includes goods value.
 */
import { appUrl, loadShipment, parseKey } from "@/server/og/data";
import { ticketFacts } from "@/server/og/ticket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = { "Access-Control-Allow-Origin": "*" };

export async function GET(request: Request, ctx: { params: Promise<{ consignment: string }> }) {
  const { consignment } = await ctx.params;
  const key = parseKey(consignment);
  const data = key ? await loadShipment(key).catch(() => null) : null;
  if (!key || !data) {
    return Response.json({ error: "Unknown shipment" }, { status: 404, headers: CORS });
  }
  const t = ticketFacts(key, data);
  const base = appUrl(request);
  const image = `${base}/api/tickets/${key.toBase58()}/image`;
  return Response.json(
    {
      name: t.name,
      symbol: "MCT",
      description:
        `The right to collect consignment ${t.ticketNo} (${t.originCity} → ${t.destinationCity}) ` +
        "from the forwarder at the destination, and to open a dispute about it. Transfer it to " +
        "sell goods in transit. Issued by the Manifest program on Solana.",
      image,
      external_url: `${base}/s/${key.toBase58()}`,
      attributes: [
        { trait_type: "Container", value: t.containerCode },
        { trait_type: "Route", value: `${t.origin} → ${t.destination}` },
        { trait_type: "Mode", value: t.mode },
        { trait_type: "Cartons", value: String(t.cartons) },
        { trait_type: "Measured volume", value: t.measuredCbm },
        { trait_type: "Container number", value: t.containerNumber },
        { trait_type: "ETA", value: t.eta },
        { trait_type: "Forwarder", value: t.forwarderName },
        { trait_type: "Status", value: t.stageLabel },
        { trait_type: "Explorer", value: t.shipmentExplorer },
      ],
      properties: { category: "image", files: [{ uri: image, type: "image/png" }] },
    },
    { headers: { ...CORS, "Cache-Control": "public, max-age=60, s-maxage=60" } },
  );
}
