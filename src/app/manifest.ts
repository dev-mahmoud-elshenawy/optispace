import type { MetadataRoute } from "next";

// Makes OptiSpace installable as a standalone desktop/mobile app. Next auto-serves this
// at /manifest.webmanifest and injects the <link rel="manifest">. Local-first: there's no
// remote server and the app only runs while `npm run dev` serves it, so there's no
// meaningful network-offline mode — hence no service worker, just installability.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OptiSpace",
    short_name: "OptiSpace",
    description: "Local-first personal workspace",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#2563eb",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
