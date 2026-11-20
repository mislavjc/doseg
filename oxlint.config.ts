import cloudflare from "@cloudflare/oxlint-config"
import { defineConfig } from "oxlint"

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
    "react/react-in-jsx-scope": "off",
    "typescript/prefer-readonly-parameter-types": "off",
    "max-lines": "off",
    "import/max-dependencies": "off",
    "sort-vars": "off",
    "no-negated-condition": "off",
    "jsx-a11y/prefer-tag-over-role": "off",
    "unicorn/prefer-at": "off",
    "unicorn/prefer-query-selector": "off",
    "typescript/consistent-return": "off",
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
    "scripts/proto/**",
  ],
})
