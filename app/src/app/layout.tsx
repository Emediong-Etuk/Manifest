import type { Metadata, Viewport } from "next";
import { Big_Shoulders_Stencil, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import "./globals.css";

const stencil = Big_Shoulders_Stencil({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-stencil-face",
  display: "swap",
  // next/font has no metric overrides for this face; fallbacks are set in globals.css.
  adjustFontFallback: false,
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Manifest",
  description: "Pay-on-proof escrow for traders who ship in shared containers.",
  applicationName: "Manifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f1e7" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1626" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${stencil.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
