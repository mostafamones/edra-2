import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { AxeResults } from "axe-core";
async function accessibility(page: Page): Promise<AxeResults> {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  return page.evaluate(() => (window as unknown as { axe: { run: () => Promise<AxeResults> } }).axe.run());
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-28T12:00:00Z"));
  // Fixture actions must never hit Supabase or any external service.
  await page.route("**/*", async route => {
    if (new URL(route.request().url()).hostname !== "127.0.0.1") throw new Error(`Unexpected external request: ${route.request().url()}`);
    await route.continue();
  });
});

for (const width of [360, 1440]) for (const theme of ["light", "dark"]) {
  test(`admin home ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/?view=home&theme=${theme}`);
    await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Start session" })).toHaveAttribute("href", "/coding/attendance/new");
    await expect(page.getByRole("link", { name: /View active students/ })).toHaveAttribute("href", "/coding/students");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await accessibility(page)).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`home-${width}-${theme}.png`), fullPage: true });
  });
}

test("home failed reads recover without false empty states", async ({ page }) => {
  await page.goto("/?view=home&state=error");
  await expect(page.getByText("Couldn’t load academy overview")).toBeVisible();
  await expect(page.getByText("No live sessions", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry", exact: true }).first().click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
});

test("populated history remains readable on a narrow screen", async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/?view=history");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Version history" })).toBeVisible();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  expect((await accessibility(page)).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("history-360-dark.png"), fullPage: true });
});

for (const width of [360, 1440]) for (const theme of ["light", "dark"]) {
  test(`coupons ${width} ${theme}: responsive and accessible`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/?theme=${theme}`);
    await expect(page.getByRole("heading", { name: "Coupons", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Details for Regular" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await accessibility(page)).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`coupons-${width}-${theme}.png`), fullPage: true });
    if (process.env.EDRA_UI_VISUAL === "1") await expect(page).toHaveScreenshot(`coupons-${width}-${theme}.png`, { fullPage: true, animations: "disabled" });
  });
}

test("failed list retries without a false empty state", async ({ page }) => {
  await page.goto("/?state=error");
  await expect(page.getByText("Couldn’t load coupon batches")).toBeVisible();
  await expect(page.getByText("No coupons", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("button", { name: "Details for Regular" })).toBeVisible();
});

test("keyboard search, reset and modal focus recovery", async ({ page }) => {
  await page.goto("/");
  const input = page.getByRole("searchbox", { name: "Search coupons" });
  await input.fill("nothing matches");
  await expect(page.getByText("No matching coupons")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filters" }).focus();
  await page.keyboard.press("Enter");
  const details = page.getByRole("button", { name: "Details for Regular" });
  await details.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(details).toBeFocused();
});

test("history retry and dismissal preserve the edited title", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/?view=history&state=error");
  await page.getByLabel("Title", { exact: true }).fill("My unsaved title");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByText("Couldn’t load history")).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("No history yet.")).toBeVisible();
  expect((await accessibility(page)).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("My unsaved title");
  await expect(page.getByRole("button", { name: "History", exact: true })).toBeFocused();
});
