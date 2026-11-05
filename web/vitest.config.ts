import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

// Matches the "@/*" path in tsconfig.json so modules that use the alias can be tested.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "e2e/**", "supabase/functions/**/*_test.ts", "scripts/dev-academy/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // workerd's built-in module does not exist in Node.
      "cloudflare:workers": fileURLToPath(new URL("./src/lib/server/cloudflare-workers.stub.ts", import.meta.url)),
    },
  },
});
