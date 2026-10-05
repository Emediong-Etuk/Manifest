/**
 * GET /api/og/container/[container]: the link preview for a container (1200x630 PNG).
 * Route, space left, rate, cut-off countdown, forwarder score and guarantee, all read
 * from the chain at request time. WhatsApp is where traders share links, and it renders
 * og:image but not Blinks. Built with next/og (Satori: flexbox only, every multi-child
 * div needs display:flex).
 */
import {
  containerMode,
  containerStatus,
  decodeFixed,
  formatCbm,
  formatCountdown,
  formatUsd,
  locodeCity,
} from "@manifest/sdk";
import { ImageResponse } from "next/og";

import { loadContainer, parseKey, scoreText } from "@/server/og/data";
import { OG, ogFonts } from "@/server/og/fonts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dollars = (v: Parameters<typeof formatUsd>[0]) => formatUsd(v).replace(/\.00$/, "");

const STATUS_LABEL: Record<string, string> = {
  open: "Booking open",
  closed: "Booking closed",
  loaded: "Sailing",
  arrived: "Arrived",
  completed: "Completed",
  cancelled: "Cancelled",
};

export async function GET(_req: Request, ctx: { params: Promise<{ container: string }> }) {
  const { container: param } = await ctx.params;
  const key = parseKey(param);
  const data = key ? await loadContainer(key).catch(() => null) : null;
  const fonts = await ogFonts();

  if (!data) {
    return new ImageResponse(
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: OG.paper,
          color: OG.ink,
          fontFamily: "Stencil",
          fontSize: 96,
        }}
      >
        MANIFEST
      </div>,
      { width: 1200, height: 630, fonts, headers: { "Cache-Control": "public, max-age=60" } },
    );
  }

  const { container: c, forwarder: f } = data;
  const now = Math.floor(Date.now() / 1000);
  const status = containerStatus(c);
  const origin = decodeFixed(c.origin);
  const destination = decodeFixed(c.destination);
  const left = Math.max(0, c.capacityCbmMilli - c.bookedCbmMilli);
  const pctBooked = c.capacityCbmMilli === 0 ? 0 : c.bookedCbmMilli / c.capacityCbmMilli;
  const cutoffIn = c.cutoffTs.toNumber() - now;
  const open = status === "open" && cutoffIn > 0;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: OG.paper,
        color: OG.ink,
        fontFamily: "Plex Sans",
        padding: "48px 60px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", fontFamily: "Stencil", fontSize: 40, letterSpacing: 2 }}>
          MANIFEST
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Plex Mono",
            fontSize: 26,
            padding: "6px 18px",
            border: `3px solid ${open ? OG.stamp : OG.muted}`,
            color: open ? OG.stamp : OG.muted,
            borderRadius: 8,
            textTransform: "uppercase",
          }}
        >
          {STATUS_LABEL[status] ?? status}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 28 }}>
        <div style={{ display: "flex", fontFamily: "Plex Mono", fontSize: 28, color: OG.muted }}>
          {`${decodeFixed(c.code)} · ${origin} → ${destination} · ${containerMode(c) === "air" ? "Air" : "Sea"}`}
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Stencil",
            fontSize: 96,
            lineHeight: 1,
            marginTop: 10,
            textTransform: "uppercase",
          }}
        >
          {`${locodeCity(origin)} → ${locodeCity(destination)}`}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30 }}>
          <span style={{ fontWeight: 600 }}>{`${formatCbm(left)} left`}</span>
          <span style={{ color: OG.muted }}>{`of ${formatCbm(c.capacityCbmMilli)}`}</span>
        </div>
        <div
          style={{
            display: "flex",
            height: 22,
            marginTop: 10,
            background: OG.raised,
            border: `2px solid ${OG.rule}`,
            borderRadius: 11,
          }}
        >
          <div
            style={{
              display: "flex",
              width: `${Math.min(100, Math.round(pctBooked * 100))}%`,
              background: OG.accent,
              borderRadius: 9,
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, marginTop: 24 }}>
        {[
          ["Rate", `${dollars(c.ratePerCbm)} / CBM`],
          ["Cut-off", open ? `in ${formatCountdown(cutoffIn)}` : "closed"],
          ["Forwarder", f ? decodeFixed(f.name) : "—"],
        ].map(([label, value]) => (
          <div
            key={label}
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              background: OG.raised,
              border: `2px solid ${OG.rule}`,
              borderRadius: 12,
              padding: "14px 20px",
            }}
          >
            <span style={{ fontSize: 22, color: OG.muted }}>{label}</span>
            <span style={{ fontSize: 34, fontWeight: 600 }}>{value}</span>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "auto",
          fontSize: 26,
        }}
      >
        <span style={{ color: OG.muted }}>Money stays locked until your goods are checked.</span>
        {f && (
          <span
            style={{
              display: "flex",
              color: "#fff",
              background: OG.stamp,
              padding: "6px 16px",
              borderRadius: 8,
              fontWeight: 600,
            }}
          >
            {`${scoreText(f)} · ${dollars(f.bondBalance)} guarantee`}
          </span>
        )}
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts,
      // Short cache: space left and the countdown change; chat apps cache previews anyway.
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
    },
  );
}
