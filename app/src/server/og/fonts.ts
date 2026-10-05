import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Static OFL fonts for next/og (Satori reads ttf/otf/woff, not woff2). Files come from the
 * Fontsource npm packages; licences sit next to them. Loaded once per server instance.
 * Pattern from node_modules/next/dist/docs/.../opengraph-image.md ("Using Node.js runtime
 * with local assets").
 */
const DIR = join(process.cwd(), "src/server/og/fonts");

type Font = { name: string; data: Buffer; weight: 400 | 500 | 600 | 800; style: "normal" };
let cached: Promise<Font[]> | undefined;

export function ogFonts(): Promise<Font[]> {
  cached ??= Promise.all([
    readFile(join(DIR, "big-shoulders-stencil-latin-800-normal.woff")).then((data): Font => ({
      name: "Stencil",
      data,
      weight: 800,
      style: "normal",
    })),
    readFile(join(DIR, "ibm-plex-sans-latin-400-normal.woff")).then((data): Font => ({
      name: "Plex Sans",
      data,
      weight: 400,
      style: "normal",
    })),
    readFile(join(DIR, "ibm-plex-sans-latin-600-normal.woff")).then((data): Font => ({
      name: "Plex Sans",
      data,
      weight: 600,
      style: "normal",
    })),
    readFile(join(DIR, "ibm-plex-mono-latin-500-normal.woff")).then((data): Font => ({
      name: "Plex Mono",
      data,
      weight: 500,
      style: "normal",
    })),
  ]);
  return cached;
}

/** Light-theme tokens from globals.css (images are always light, for sunlight and chat apps). */
export const OG = {
  paper: "#f6f1e7",
  raised: "#fffdf8",
  ink: "#14213d",
  muted: "#4a5470",
  rule: "#d9cfbd",
  accent: "#c2410c",
  stamp: "#2f7d4f",
  danger: "#b42318",
} as const;
