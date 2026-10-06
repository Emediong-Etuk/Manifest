# Illustration slots

Greg's original illustrations go here. Components reference these paths, so keep
the file names. SVG preferred (optimised, no embedded raster); PNG/WebP fallback
at 2x is fine.

| File                   | Used on                                              | Artboard   |
| ---------------------- | ---------------------------------------------------- | ---------- |
| `hero.svg`             | Landing page hero (drawn, Oct 6)                     | 1200 × 800 |
| `empty-shipments.svg`  | `/me` with no consignments (drawn, Oct 6)            | 480 × 360  |
| `empty-containers.svg` | `/containers` with no open containers (drawn, Oct 6) | 480 × 360  |
| `empty-forwarder.svg`  | `/forwarder` before registration (drawn, Oct 6)      | 480 × 360  |
| `not-found.svg`        | 404 page (drawn, Oct 6)                              | 640 × 480  |
| `cargo-ticket-art.svg` | Not used (ticket images are generated in code)       | 1200 × 630 |

Palette: paper `#f6f1e7`, ink navy `#14213d`, container orange `#c2410c`,
stamp green `#2f7d4f`. Illustrations should read on both the light and dark
(`#0f1626`) backgrounds, or ship a `-dark` variant.

## Logo

The mark (container doors with a green "verified" stamp) is drawn in
`src/components/logo.tsx` (theme colours, used in the header) and `src/app/icon.svg`
(favicon; copied to `public/icon.svg` for the PWA and wallet prompts). The PNGs
(`src/app/apple-icon.png` 180 px full-bleed, `public/icon-192.png`, `public/icon-512.png`)
are rendered from `icon.svg`; re-render them if the mark changes.
