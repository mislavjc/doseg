import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "max-lines-per-function": [
        "error",
        { max: 90, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".claude/**",
    ".expect/**",
    // Archived experiments, kept as the evidence behind a decision rather than
    // as maintained code. Their value is being exactly what was run, so linting
    // them would only pressure us to edit the record.
    "scripts/proto/**",
  ]),
]);

export default eslintConfig;
