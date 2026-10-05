/**
 * GET /api/tickets/[consignment]/image: the Cargo Ticket artwork (1080x1080 PNG), drawn
 * like a printed cargo ticket: route in port codes, container code, cartons, measured
 * volume, a QR to the public shipment page, and a VOID stamp once the shipment is final.
 * Read live from the chain at request time; no goods value.
 */
import { ImageResponse } from "next/og";
import QRCode from "qrcode";

import { appUrl, loadShipment, parseKey } from "@/server/og/data";
import { OG, ogFonts } from "@/server/og/fonts";
import { ticketFacts } from "@/server/og/ticket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIZE = 1080;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "50%", marginBottom: 22 }}>
      <span style={{ fontSize: 22, color: OG.muted, textTransform: "uppercase", letterSpacing: 2 }}>
        {label}
      </span>
      <span style={{ fontFamily: "Plex Mono", fontSize: 36 }}>{value}</span>
    </div>
  );
}

export async function GET(request: Request, ctx: { params: Promise<{ consignment: string }> }) {
  const { consignment } = await ctx.params;
  const key = parseKey(consignment);
  const data = key ? await loadShipment(key).catch(() => null) : null;
  if (!key || !data) return new Response("Unknown shipment", { status: 404 });

  const t = ticketFacts(key, data);
  const verifyUrl = `${appUrl(request)}/s/${key.toBase58()}`;
  const qr = await QRCode.toDataURL(verifyUrl, {
    margin: 0,
    width: 240,
    errorCorrectionLevel: "M",
    color: { dark: OG.ink, light: OG.raised },
  });
  const fonts = await ogFonts();

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: OG.accent,
        padding: 48,
        fontFamily: "Plex Sans",
        color: OG.ink,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          background: OG.raised,
          borderRadius: 28,
          position: "relative",
        }}
      >
        {/* Header band */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: OG.ink,
            color: OG.paper,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: "26px 44px",
          }}
        >
          <span style={{ fontFamily: "Stencil", fontSize: 46, letterSpacing: 3 }}>MANIFEST</span>
          <span style={{ fontFamily: "Plex Mono", fontSize: 28, letterSpacing: 2 }}>
            CARGO TICKET
          </span>
        </div>

        {/* Route */}
        <div style={{ display: "flex", flexDirection: "column", padding: "34px 44px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: "Stencil", fontSize: 150, lineHeight: 1 }}>
                {t.origin}
              </span>
              <span style={{ fontSize: 30, color: OG.muted }}>{t.originCity}</span>
            </div>
            <span style={{ fontSize: 72, color: OG.accent, marginTop: -30 }}>→</span>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{ fontFamily: "Stencil", fontSize: 150, lineHeight: 1 }}>
                {t.destination}
              </span>
              <span style={{ fontSize: 30, color: OG.muted }}>{t.destinationCity}</span>
            </div>
          </div>
        </div>

        {/* Facts */}
        <div style={{ display: "flex", flexWrap: "wrap", padding: "36px 44px 0" }}>
          <Field label="Ticket" value={t.ticketNo} />
          <Field label={`${t.mode} freight`} value={t.containerCode} />
          <Field label="Cartons" value={String(t.cartons)} />
          <Field label="Measured" value={t.measuredCbm} />
          <Field label="Container no." value={t.containerNumber} />
          <Field label="ETA" value={t.eta} />
        </div>

        {/* Perforation */}
        <div
          style={{
            display: "flex",
            margin: "6px 0 0",
            borderTop: `4px dashed ${OG.rule}`,
          }}
        />

        {/* Stub */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "26px 44px",
            flex: 1,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 560 }}>
            <span
              style={{
                fontSize: 22,
                color: OG.muted,
                textTransform: "uppercase",
                letterSpacing: 2,
              }}
            >
              Status
            </span>
            <span style={{ fontSize: 44, fontWeight: 600 }}>{t.stageLabel}</span>
            <span style={{ fontSize: 24, color: OG.muted, marginTop: 10 }}>
              {t.forwarderName ? `Forwarder: ${t.forwarderName}` : ""}
            </span>
            <span style={{ fontSize: 22, color: OG.muted, marginTop: 6 }}>
              Scan to verify on Solana
            </span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain img */}
          <img src={qr} width={200} height={200} alt="" />
        </div>

        {t.void && (
          <div
            style={{
              position: "absolute",
              top: 380,
              left: 170,
              display: "flex",
              fontFamily: "Stencil",
              fontSize: 220,
              color: OG.danger,
              border: `14px solid ${OG.danger}`,
              borderRadius: 24,
              padding: "0 40px",
              transform: "rotate(-18deg)",
              opacity: 0.82,
            }}
          >
            VOID
          </div>
        )}
      </div>
    </div>,
    {
      width: SIZE,
      height: SIZE,
      fonts,
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    },
  );
}
