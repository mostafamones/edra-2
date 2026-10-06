import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Matches the "@/*" path in tsconfig.json so modules that use the alias can be tested.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
