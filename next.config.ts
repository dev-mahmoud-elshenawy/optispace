import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node-ical pulls in @js-temporal/polyfill (JSBI), which breaks when bundled by
  // Turbopack ("BigInt is not a function"). Keep it a native Node require.
  serverExternalPackages: ["node-ical"],
  experimental: {
    // Project file uploads go through server actions; raise the default 1 MB cap.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
