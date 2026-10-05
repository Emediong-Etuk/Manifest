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
  };
}
