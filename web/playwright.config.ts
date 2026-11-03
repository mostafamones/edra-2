import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "smoke.spec.ts",
  timeout: 30_000,
  // Build gets 120 seconds in addition to the original startup and suite budgets.
  globalTimeout: 420_000,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [["line"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://app.lvh.me:3100",
    storageState: { cookies: [], origins: [] },
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{
    name: "chromium",
    use: {
      ...devices["Desktop Chrome"],
      launchOptions: {
        args: ["--host-resolver-rules=MAP lvh.me 127.0.0.1, MAP *.lvh.me 127.0.0.1"],
      },
    },
  }],
  webServer: {
    command: "node e2e/server.mjs",
    // The runner probes loopback with the canonical staff Host and warms login.
    wait: { stdout: /E2E login ready on port 3100/ },
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      // Keeps the HTTP lvh.me origins valid, as in the original development-runtime suite.
      NODE_ENV: "development",
      VITE_EDRA_MARKETING_ORIGIN: "http://lvh.me:3100",
      VITE_EDRA_APP_ORIGIN: "http://app.lvh.me:3100",
      VITE_EDRA_LEARN_ORIGIN: "http://learn.lvh.me:3100",
      EDRA_MARKETING_ORIGIN: "http://lvh.me:3100",
      EDRA_APP_ORIGIN: "http://app.lvh.me:3100",
      EDRA_LEARN_ORIGIN: "http://learn.lvh.me:3100",
      VITE_EDRA_COOKIE_DOMAIN: "lvh.me",
      EDRA_DEV_TUNNEL_HOST: "",
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "playwright-placeholder-key",
    },
  },
});
