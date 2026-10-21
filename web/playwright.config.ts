import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "smoke.spec.ts",
  timeout: 30_000,
  globalTimeout: 300_000,
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
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: "development",
      EDRA_E2E: "1",
      NEXT_PUBLIC_EDRA_MARKETING_ORIGIN: "http://lvh.me:3100",
      NEXT_PUBLIC_EDRA_APP_ORIGIN: "http://app.lvh.me:3100",
      NEXT_PUBLIC_EDRA_LEARN_ORIGIN: "http://learn.lvh.me:3100",
      EDRA_MARKETING_ORIGIN: "http://lvh.me:3100",
      EDRA_APP_ORIGIN: "http://app.lvh.me:3100",
      EDRA_LEARN_ORIGIN: "http://learn.lvh.me:3100",
      NEXT_PUBLIC_EDRA_COOKIE_DOMAIN: "lvh.me",
      EDRA_DEV_TUNNEL_HOST: "",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "playwright-placeholder-key",
    },
  },
});
