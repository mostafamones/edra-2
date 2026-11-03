import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import react from "eslint-plugin-react";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";

// Anchored: a bare "server-only" gitignore pattern would also match @tanstack/react-start/server-only.
const forbidden = ["next", "next/*", "/server-only"];
const iconImports = ["@tabler/*", "lucide*", "react-icons", "react-icons/*"];
export default defineConfig([
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  // The non-Next rules of eslint-config-next 16.3.5, which this config replaced.
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    plugins: { react, import: importPlugin, "jsx-a11y": jsxA11y },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      "import/no-anonymous-default-export": "warn",
      "react/no-unknown-property": "off",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "jsx-a11y/alt-text": ["warn", { elements: ["img"], img: ["Image"] }],
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",
      "react/jsx-no-target-blank": "off",
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "no-restricted-imports": ["error", { patterns: [{ group: forbidden, message: "Use the Start and Edra APIs." }] }],
    },
  },
  {
    files: ["src/modules/content/coupons/**/*.{ts,tsx}", "src/components/shared/query-content.tsx"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        { group: forbidden, message: "Use the Start and Edra APIs." },
        { group: iconImports, message: "Use Hugeicons with strokeWidth 1.5; see docs/ui/README.md." },
      ] }],
    },
  },
  globalIgnores(["dist/**", ".wrangler/**", "src/routeTree.gen.ts", "out/**", "build/**", "playwright-report/**", "test-results/**", "blob-report/**"]),
]);
