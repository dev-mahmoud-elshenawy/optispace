import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep these native Node requires (not Turbopack-bundled): @azure/msal-node (CJS token cache)
  // for Graph auth, and node-ical (pulls @js-temporal/polyfill / JSBI, "BigInt is not a function"
  // when bundled) for the ICS fallback feed.
  serverExternalPackages: ["@azure/msal-node", "node-ical"],
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
