import type { MetadataRoute } from "next";

// PWA manifest so traders can install Manifest to their home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Manifest",
    short_name: "Manifest",
    description: "Pay-on-proof escrow for traders who ship in shared containers.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f1e7",
    theme_color: "#f6f1e7",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
