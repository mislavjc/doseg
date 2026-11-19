import type { KnipConfig } from "knip"

const config: KnipConfig = {
  entry: [
    "scripts/*.ts",
    "scripts/promjene/*.ts",
    "scripts/promjene/eval/*.ts",
    "lib/generated/index.ts",
    "scripts/proto/*.ts",
  ],
  project: ["**/*.{ts,tsx,mjs,css}"],
  ignoreBinaries: ["portless"],
  compilers: {
    css: (text: string) =>
      [...text.matchAll(/(?<=@)import[^;]+/gu)].join("\n"),
  },
}

export default config
