import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Project file uploads go through server actions; raise the default 1 MB cap.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
