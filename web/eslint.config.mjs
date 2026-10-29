import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/modules/content/coupons/**/*.{ts,tsx}", "src/components/shared/query-content.tsx"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@tabler/*", "lucide*", "react-icons", "react-icons/*"], message: "Use Hugeicons with strokeWidth 1.5; see docs/ui/README.md." }] }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
  ]),
]);

export default eslintConfig;
