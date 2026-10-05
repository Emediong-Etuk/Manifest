import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The next/og routes read font files at runtime (src/server/og/fonts.ts); make sure the
  // serverless bundles include them (docs: next.config.js `output`, outputFileTracingIncludes).
  outputFileTracingIncludes: {
    "/api/og/**": ["src/server/og/fonts/*.woff"],
    "/api/tickets/**": ["src/server/og/fonts/*.woff"],
  },
};

export default nextConfig;
