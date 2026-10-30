import { defineConfig } from "@playwright/test";

const previewURL = `http://127.0.0.1:${process.env.EDRA_UI_PORT ?? 3101}`;

export default defineConfig({
  testDir: "./e2e/ui", timeout: 30_000, workers: 1, retries: 0, forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { outputFolder: "playwright-report/ui", open: "never" }]],
  outputDir: "test-results/ui",
  use: { baseURL: previewURL, browserName: "chromium", channel: process.env.EDRA_UI_BROWSER === "msedge" ? "msedge" : undefined, locale: "en-GB", timezoneId: "Africa/Cairo", reducedMotion: "reduce", trace: "retain-on-failure" },
  // The owner starts local servers from VS Code. Only CI owns a preview server.
  webServer: process.env.CI ? { command: "npm run ui:preview", url: previewURL, reuseExistingServer: false, timeout: 60_000 } : undefined,
});
