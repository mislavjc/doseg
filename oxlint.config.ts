import cloudflare from "@cloudflare/oxlint-config"
import { defineConfig } from "oxlint"

// Cloudflare's preset (on top of @nkzw/oxlint-config) supplies the type-safety, promise and
// type-import rules. On top of it we keep doseg's stricter category-wide baseline: oxlint is
// pinned to an exact version in package.json, so a category can only grow on a deliberate bump.
export default defineConfig({
  ...cloudflare,
  plugins: [...(cloudflare.plugins ?? []), "eslint", "nextjs"],
  categories: {
    correctness: "error",
    suspicious: "error",
    perf: "error",
    pedantic: "error",
  },
  options: {
    ...cloudflare.options,
    typeAware: true,
    denyWarnings: true,
    reportUnusedDisableDirectives: "error",
  },
  overrides: [
    ...(cloudflare.overrides ?? []),
    {
      // Build and data scripts are CLIs: stdout progress and summaries are their interface.
      files: ["scripts/**"],
      rules: { "no-console": "off" },
    },
    {
      // OG cards render through Satori, which only understands a plain <img>; next/image does not exist there.
      files: ["app/api/og/**"],
      rules: { "nextjs/no-img-element": "off" },
    },
    {
      // The import resolver reads maplibre-gl's UMD main and finds no named exports; its ESM build and
      // types export every name this re-export forwards, and tsc checks each import of it.
      files: ["lib/maplibre.ts"],
      rules: { "import/export": "off" },
    },
  ],
  rules: {
    ...cloudflare.rules,
    "max-lines-per-function": [
      "error",
      { max: 90, skipBlankLines: true, skipComments: true },
    ],
    "typescript/strict-boolean-expressions": [
      "error",
      { allowNullableBoolean: true, allowNullableString: true },
    ],
    "typescript/no-confusing-void-expression": [
      "error",
      { ignoreArrowShorthand: true },
    ],
    "typescript/prefer-nullish-coalescing": [
      "error",
      { ignorePrimitives: { string: true } },
    ],
    "promise/always-return": ["error", { ignoreLastCallback: true }],
    "import/no-unassigned-import": ["error", { allow: ["**/*.css"] }],
    // console.error is the app's error reporting: container logs on the server, devtools on the client. Everything else stays banned.
    "no-console": ["error", { allow: ["error"] }],

    // The automatic JSX runtime (react-jsx in tsconfig) never needs React in scope.
    "react/react-in-jsx-scope": "off",
    // Would demand readonly on every props object and array param, 2000+ sites with no bug behind any.
    "typescript/prefer-readonly-parameter-types": "off",
    // The 90-line function cap is the unit we enforce; long data and section files are fine.
    "max-lines": "off",
    // Pages compose many primitives and icons; an import count says nothing about design.
    "import/max-dependencies": "off",
    // Declaration order follows meaning (lat before lon), not the alphabet.
    "sort-vars": "off",
    // Duplicate of unicorn/no-negated-condition, which stays on.
    "no-negated-condition": "off",
    // role="status" on a div is the right live region; <output> is inline and form-associated, so swapping changes layout.
    "jsx-a11y/prefer-tag-over-role": "off",
    // Without noUncheckedIndexedAccess only .at() types as T | undefined, so it forces guards [0] never needs on the same arrays.
    "unicorn/prefer-at": "off",
    // getElementById takes an id as-is; the querySelector rewrite needs CSS escaping for ids that start with a digit.
    "unicorn/prefer-query-selector": "off",
    // Clashes with unicorn/no-useless-undefined on effects that bail early and otherwise return a cleanup; tsc already checks return types.
    "typescript/consistent-return": "off",
    // Number() is not parseInt/parseFloat: "31A" and "16px" parse today and would become NaN.
    "unicorn/prefer-number-coercion": "off",
  },
  ignorePatterns: [
    ...(cloudflare.ignorePatterns ?? []),
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".claude/**",
    ".expect/**",
    "transit/**",
    // Archived experiments kept as the record of what was run, not maintained code.
    "scripts/proto/**",
  ],
})
