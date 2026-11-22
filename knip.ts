import type { KnipConfig } from "knip"

const config: KnipConfig = {
  entry: [
    "scripts/*.ts",
    "scripts/promjene/*.ts",
    "scripts/promjene/eval/*.ts",
    "lib/generated/index.ts",
    "scripts/proto/*.ts",
    // Loaded by e2e/serve.ts through NODE_OPTIONS=--import, which knip cannot follow.
    "e2e/upstream/preload.ts",
  ],
  project: ["**/*.{ts,tsx,mjs,css}"],
  includeEntryExports: true,
  treatConfigHintsAsErrors: true,
  // ts-rs writes one export per Rust type the server can return; the barrel mirrors the crate, not what TS imports today.
  ignoreIssues: { "lib/generated/**": ["exports", "types"] },
  // portless is the dev-proxy CLI installed globally on dev machines (bun run dev), never a dependency.
  ignoreBinaries: ["portless"],
  compilers: {
    css: (text: string) => [...text.matchAll(/(?<=@)import[^;]+/gu)].join("\n"),
  },
}

export default config
