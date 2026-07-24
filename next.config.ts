import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep @azure/msal-node a native Node require (it's a CJS package with a token cache that
  // dislikes being bundled by Turbopack). Graph auth uses it server-side only.
  serverExternalPackages: ["@azure/msal-node"],
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
