import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-28T12:00:00Z"));
  await page.route("**/*", async route => {
    if (new URL(route.request().url()).hostname !== "127.0.0.1") throw new Error(`Unexpected external request: ${route.request().url()}`);
    await route.continue();
  });
});

// Captures the document at the moment the browser dialog would open; the test then drives afterprint itself.
async function stubPrint(page: Page) { await page.evaluate(() => { const w = window as unknown as { printed: number; print: () => void }; w.printed = 0; w.print = () => { w.printed++; }; }); }
async function openPreview(page: Page, type: string, theme = "dark", width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/?theme=${theme}`);
  await stubPrint(page);
  await page.getByRole("button", { name: `Details for ${type}` }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Print", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Print coupons" });
  await expect(preview.getByRole("button", { name: "Print", exact: true })).toBeEnabled();
  return preview;
}
async function choose(page: Page, status: string) {
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: status, exact: true }).click();
}
function pdfPages(pdf: Buffer) {
  const text = pdf.toString("latin1");
  return { count: text.match(/\/Type\s*\/Page(?![a-z])/g)?.length ?? 0, boxes: [...new Set([...text.matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)].map(m => `${Math.round(Number(m[1]))}x${Math.round(Number(m[2]))}`))] };
}
async function printPdf(page: Page, name: string, info: { outputPath: (name: string) => string }) {
  await page.getByRole("dialog", { name: "Print coupons" }).getByRole("button", { name: "Print", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, path: info.outputPath(`${name}.pdf`) });
  return pdfPages(pdf);
}

for (const [type, status, coupons, pages] of [["Regular", "Unused", 24, 1], ["Regular", "All", 48, 2], ["Revision · مراجعة نهائية", "Redeemed", 25, 2], ["Revision · مراجعة نهائية", "All", 1000, 42]] as const) {
  test(`prints ${coupons} ${type.slice(0, 8)} ${status} coupons on ${pages} A4 sheets`, async ({ page }, info) => {
    const preview = await openPreview(page, type);
    if (status !== "Unused") await choose(page, status);
    await expect(preview.getByText(`${coupons.toLocaleString()} coupons · ${pages} page${pages === 1 ? "" : "s"}`)).toBeVisible();
    const result = await printPdf(page, `coupons-${coupons}-${status.toLowerCase()}`, info);
    expect(result).toEqual({ count: pages, boxes: ["595x842"] });
  });
}

test("print layout: A4 3 × 8 grid, readable codes, monochrome statuses and only coupon sheets", async ({ page }, info) => {
  const preview = await openPreview(page, "Regular");
  await choose(page, "All");
  await preview.getByRole("button", { name: "Print", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  await page.emulateMedia({ media: "print" });
  const layout = await page.evaluate(() => {
    const root = document.querySelector(".coupon-print-root")!;
    const sheets = [...root.querySelectorAll<HTMLElement>(".coupon-sheet")];
    const first = sheets[0].getBoundingClientRect();
    const cards = [...sheets[0].querySelectorAll<HTMLElement>(".coupon-card")].map(c => c.getBoundingClientRect());
    const codes = [...root.querySelectorAll<HTMLElement>(".coupon-card-code")];
    const statuses = [...root.querySelectorAll<HTMLElement>(".coupon-card-status")];
    const visible = (el: Element) => getComputedStyle(el).display !== "none";
    return {
      fonts: document.fonts.status, html: document.documentElement.classList.contains("coupon-printing"),
      sheet: [Math.round(first.width), Math.round(first.height)], sheets: sheets.length,
      columns: new Set(cards.map(c => Math.round(c.left))).size, rows: new Set(cards.map(c => Math.round(c.top))).size,
      cardsInside: cards.every(c => c.left >= first.left && c.right <= first.right + 0.5 && c.bottom <= first.bottom + 0.5),
      codesUnclipped: codes.every(c => c.scrollWidth <= c.clientWidth && c.scrollHeight <= c.clientHeight + 1 && getComputedStyle(c).direction === "ltr"),
      cutLine: getComputedStyle(sheets[0].querySelector(".coupon-card")!).borderTopStyle,
      ink: [...new Set([...codes, ...statuses].map(c => getComputedStyle(c).color))],
      background: getComputedStyle(sheets[0]).backgroundColor,
      statuses: [...new Set(statuses.map(s => s.textContent))],
      others: [...document.body.children].filter(e => e !== root && visible(e)).map(e => e.tagName),
    };
  });
  expect(layout).toEqual({ fonts: "loaded", html: true, sheet: [794, 1123], sheets: 2, columns: 3, rows: 8, cardsInside: true, codesUnclipped: true, cutLine: "dashed", ink: ["rgb(0, 0, 0)"], background: "rgb(255, 255, 255)", statuses: ["Redeemed", "Revoked"], others: [] });
  await page.screenshot({ path: info.outputPath("coupon-print-media.png"), fullPage: true });
  await page.emulateMedia({ media: "screen" });
  // Cancelling the browser dialog restores the usable preview and focus.
  await page.evaluate(() => dispatchEvent(new Event("afterprint")));
  await expect(page.locator(".coupon-print-root")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.classList.contains("coupon-printing"))).toBe(false);
  await expect(preview.getByRole("button", { name: "Print", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog").getByRole("button", { name: "Print", exact: true })).toBeFocused();
});

test("narrow preview scales sheets inside the dialog", async ({ page }, info) => {
  const preview = await openPreview(page, "Regular", "light", 360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const box = await preview.locator(".coupon-sheet").first().boundingBox();
  expect(box!.width).toBeLessThanOrEqual(330);
  await page.screenshot({ path: info.outputPath("coupon-print-preview-360.png") });
});
