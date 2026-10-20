import { expect, test as base, type Page } from "@playwright/test";

// Each test gets Playwright's fresh context. Abort unexpected auth traffic and
// assert after the scenario so even a handled network error fails the test.
const test = base.extend<{ noSupabaseRequests: void }>({
  noSupabaseRequests: [async ({ context }, use) => {
    const requests: string[] = [];
    await context.route("http://127.0.0.1:54321/**", async (route) => {
      requests.push(route.request().url());
      await route.abort("blockedbyclient");
    });
    await use();
    expect(requests, "Signed-out smoke tests must not contact Supabase").toEqual([]);
  }, { auto: true }],
});

async function expectLoginForm(page: Page) {
  await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
  await expect(page.getByLabel("Mobile number", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
}

test("login renders and validates without an auth request", async ({ page }) => {
  await page.goto("/auth/login");
  await expectLoginForm(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Phone number is required", { exact: true })).toBeVisible();
  await expect(page.getByText("Enter your password", { exact: true })).toBeVisible();

  await page.getByLabel("Mobile number", { exact: true }).fill("123");
  await page.getByLabel("Password", { exact: true }).fill("smoke-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Enter a valid Egyptian mobile number", { exact: true })).toBeVisible();
  await expect(page).toHaveURL("http://app.lvh.me:3100/auth/login");
});

test("signed-out staff and student paths preserve their return destination", async ({ page }) => {
  for (const { origin, path } of [
    { origin: "http://app.lvh.me:3100", path: "/" },
    { origin: "http://app.lvh.me:3100", path: "/smoke-academy/attendance?status=active" },
    { origin: "http://learn.lvh.me:3100", path: "/" },
  ]) {
    await test.step(`${origin}${path}`, async () => {
      await page.goto(origin + path);
      await expect(page).toHaveURL((url) =>
        url.origin === origin && url.pathname === "/auth/login" &&
        url.searchParams.get("next") === path,
      );
      await expectLoginForm(page);
    });
  }
});

test("missing marketing page renders the framework 404", async ({ page }) => {
  const response = await page.goto("http://lvh.me:3100/__playwright_missing_page__");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "This page could not be found.", exact: true })).toBeVisible();
});
