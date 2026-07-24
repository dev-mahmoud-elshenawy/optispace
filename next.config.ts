import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node-ical pulls in @js-temporal/polyfill (JSBI), which breaks when bundled by
  // Turbopack ("BigInt is not a function"). Keep it a native Node require.
  serverExternalPackages: ["node-ical"],
  experimental: {
    // Project file uploads go through server actions; raise the default 1 MB cap.
    serverActions: { bodySizeLimit: "8mb" },
    // Client-side Router Cache for our force-dynamic pages: back-navigation within 30s serves the
    // cached RSC payload (instant re-open) instead of re-running every server query. Freshness is
    // preserved elsewhere — the 2-min background sync + router.refresh() on mutations still refetch,
    // and 30s is well under the sync interval so staleness never outlives a poll cycle.
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
