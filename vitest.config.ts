import path from "node:path";

// ponytail: minimal — just enough alias resolution for the existing/new *.test.ts
// files to run standalone (no React/DOM tests exist yet, so no jsdom environment).
// Plain object, not `defineConfig` from "vitest/config" — vitest isn't a declared
// project dependency (only ever invoked via `npx`), so that import doesn't resolve.
export default {
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      { find: "server-only", replacement: path.resolve(__dirname, "src/test/server-only-stub.ts") },
    ],
  },
};
