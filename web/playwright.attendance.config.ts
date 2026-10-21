import { defineConfig } from "@playwright/test";
import smoke from "./playwright.config";
import { execFileSync } from "node:child_process";

// Privileged validation stays in its own assertion process; only public settings return here.
const target = JSON.parse(execFileSync(process.execPath, ["e2e/attendance/setup.mjs", "config"], {
  encoding: "utf8", timeout: 40_000,
})) as { apiUrl: string; publicKey: string };
export default defineConfig({
  ...smoke,
  testDir: "./e2e/attendance",
  testMatch: "flow.spec.ts",
  // Cold `next dev` compiles each academy route on first visit.
  timeout: 400_000,
  expect: { timeout: 90_000 },
  globalTimeout: 600_000,
  outputDir: "test-results/attendance",
  reporter: [["line"], ["html", { outputFolder: "playwright-report/attendance", open: "never" }]],
  webServer: {
    ...smoke.webServer,
    command: "node e2e/server.mjs",
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...(smoke.webServer as { env: Record<string, string> }).env,
      NEXT_PUBLIC_SUPABASE_URL: target.apiUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: target.publicKey,
    },
  },
});
