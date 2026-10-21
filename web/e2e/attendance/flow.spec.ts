import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test as base, type Page, type BrowserContext } from "@playwright/test";
import { privateJson } from "./target.mjs";
import type { AttendanceSheet } from "../../src/modules/attendance/types";

type Academy = { id: string; name: string; slug: string; schedule: string; title: string; session: string; students: { id: string; name: string }[] };
const fixture = privateJson(process.env.ATTENDANCE_FIXTURE) as {
  apiUrl: string; publicKey: string; phone: string; password: string; instructor: string; instructorName: string; academies: Academy[];
};
const [a, b, c] = fixture.academies;
const [target, control] = b.students;
const staff = "http://app.lvh.me:3100";
async function guardTraffic(context: BrowserContext) {
  const unexpected: string[] = [];
  const allowed = new Set([staff, "http://lvh.me:3100", "http://learn.lvh.me:3100", fixture.apiUrl.replace(/\/$/, "")]);
  await context.route("**/*", async (route) => {
    const origin = new URL(route.request().url()).origin;
    if (allowed.has(origin)) await route.continue();
    else { unexpected.push(origin); await route.abort("blockedbyclient"); }
  });
  await context.routeWebSocket("**/*", (socket) => {
    const url = new URL(socket.url());
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    if (allowed.has(url.origin)) socket.connectToServer();
    else { unexpected.push(url.origin); socket.close(); }
  });
  return unexpected;
}
const test = base.extend<{ isolatedTraffic: void }>({
  isolatedTraffic: [async ({ context }, use) => {
    const unexpected = await guardTraffic(context);
    await use();
    expect(unexpected, "Browser traffic escaped the isolated target").toEqual([]);
  }, { auto: true }],
});
function snapshot(session: string) {
  return JSON.parse(execFileSync(process.execPath, ["e2e/attendance/setup.mjs", "snapshot", session], { encoding: "utf8", timeout: 40_000 }));
}
async function signIn(page: Page) {
  await page.goto("/auth/login");
  await page.getByLabel("Mobile number", { exact: true }).fill(fixture.phone);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL((url) => [a.slug, b.slug].includes(url.pathname.split("/")[1]));
  await expect(page.getByRole("button", { name: /^Switch academy/ })).toBeVisible();
}
async function switchTo(page: Page, academy: Academy) {
  await page.getByRole("button", { name: /^Switch academy/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(academy.name) }).click();
  await expect(page).toHaveURL((url) => url.pathname.split("/")[1] === academy.slug);
  await expect(page.getByRole("button", { name: `Switch academy, current: ${academy.name}`, exact: true })).toBeVisible();
}
function cookieResponse(page: Page, session: string) {
  return page.waitForResponse(async (response) => {
    const url = new URL(response.url());
    if (url.pathname !== `/api/sessions/${session}/attendance` || url.searchParams.get("academy") !== b.id || response.status() !== 200) return false;
    const sheet = await response.json() as AttendanceSheet;
    return sheet.entries.some((entry) => entry.annualStudentRecordId === target.id && entry.status === "present");
  });
}
function verifySheet(sheet: AttendanceSheet) {
  expect(sheet.session.academyId).toBe(b.id);
  expect(sheet.session.scheduleTitle).toBe(b.title);
  expect(sheet.publication).toBe("unpublished");
  expect(sheet.publicationCount).toBe(0);
  expect(sheet.publishedRevision).toBeNull();
  expect(sheet.revision).toBeGreaterThan(0);
  const entry = sheet.entries.find((entry) => entry.annualStudentRecordId === target.id)!;
  expect(entry.status).toBe("present");
  expect(entry.source).toBe("check_in");
  expect(entry.updatedBy).toBe(fixture.instructor);
  expect(entry.checkedInAt).toBeTruthy();
  expect(Number.isNaN(Date.parse(entry.checkedInAt!))).toBe(false);
  expect(entry.version).toBeGreaterThan(0);
  expect(entry.publishedStatus).toBeNull();
  const untouched = sheet.entries.find((entry) => entry.annualStudentRecordId === control.id)!;
  expect(untouched.status).toBe("unknown");
  expect(untouched.version).toBe(0);
}

test("password UI check-in persists as a draft; signed-out and cross-academy requests cannot mutate", async ({ page, playwright }) => {
  await signIn(page);
  if (new URL(page.url()).pathname.split("/")[1] === b.slug) await switchTo(page, a);
  await switchTo(page, b);
  await page.getByRole("link", { name: "Sessions", exact: true }).click();
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Start a session" });
  await dialog.getByRole("combobox", { name: "Schedule" }).click();
  await page.getByRole("option", { name: new RegExp(b.title) }).click();
  await dialog.getByRole("button", { name: "Start session", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${b.slug}/attendance/[0-9a-f-]{36}$`));
  const session = new URL(page.url()).pathname.split("/").at(-1)!;
  const path = `/${b.slug}/attendance/${session}`;
  await expect(page.getByRole("heading", { name: b.title, exact: true })).toBeVisible();
  for (const student of [target, control]) {
    await expect(page.getByRole("group", { name: `Attendance for ${student.name}`, exact: true }).getByRole("button", { name: "Unknown", exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByRole("textbox", { name: "Minutes after the session start before a check-in is Late (0 for never)" }).fill("0");
  await page.getByRole("combobox", { name: /^Check in a student by name/ }).fill(target.name);
  const acknowledged = cookieResponse(page, session);
  await page.getByRole("option", { name: new RegExp(target.name) }).click();
  verifySheet(await (await acknowledged).json());
  const refreshed = cookieResponse(page, session);
  await page.reload();
  verifySheet(await (await refreshed).json());
  await expect(page.getByRole("group", { name: `Attendance for ${target.name}`, exact: true }).getByRole("button", { name: "Present", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("row").filter({ hasText: target.name })).toContainText(`Checked in by ${fixture.instructorName}`);
  await expect(page.getByRole("group", { name: `Attendance for ${control.name}`, exact: true }).getByRole("button", { name: "Unknown", exact: true })).toHaveAttribute("aria-pressed", "true");
  const persisted = snapshot(session);
  expect(persisted.session.academy_id).toBe(b.id);
  expect(persisted.session.schedule_id).toBe(b.schedule);
  expect(persisted.records).toHaveLength(1);
  expect(persisted.records[0]).toMatchObject({ annual_student_record_id: target.id, status: "present", source: "check_in", checked_in_by: fixture.instructor, updated_by: fixture.instructor });
  expect(persisted.records[0].version).toBeGreaterThan(0);
  expect(persisted.records[0].checked_in_at).toBeTruthy();
  expect(persisted.publications).toBe(0);
  expect(persisted.sheet.publication_count).toBe(0);

  const signedOut = await page.context().browser()!.newContext();
  const guestTraffic = await guardTraffic(signedOut);
  const anonymous = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3100", extraHTTPHeaders: { Host: "app.lvh.me:3100" } });
  try {
    const guest = await signedOut.newPage();
    await guest.goto(staff + path);
    await expect(guest).toHaveURL((url) => url.pathname === "/auth/login" && url.searchParams.get("next") === path);
    const denied = await anonymous.post(`/api/v1/sessions/${session}/check-ins`, { headers: { "Idempotency-Key": randomUUID() }, data: { annual_student_record_id: control.id, late_after_minutes: 0 }, maxRedirects: 0 });
    expect(denied.status()).toBe(401);
    expect((await denied.json()).error.code).toBe("UNAUTHENTICATED");
    expect(snapshot(session)).toEqual(persisted);
  } finally { await signedOut.close(); await anonymous.dispose(); }
  expect(guestTraffic).toEqual([]);

  // Separate genuine login for the denial scenario; no copied cookies or storage state.
  await page.context().clearCookies();
  await page.goto("/auth/login");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await signIn(page);
  await page.getByRole("button", { name: /^Switch academy/ }).click();
  await expect(page.getByRole("menuitem", { name: new RegExp(c.name) })).toHaveCount(0);
  await page.keyboard.press("Escape");
  const forbiddenBefore = snapshot(c.session);
  await page.goto(`/${c.slug}/attendance/${c.session}`);
  await expect(page).toHaveURL(staff + `/${c.slug}/attendance/${c.session}`);
  await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
  await expect(page.getByText(c.title, { exact: true })).toHaveCount(0);
  await expect(page.getByText(c.students[0].name, { exact: true })).toHaveCount(0);

  const auth = createClient(fixture.apiUrl, fixture.publicKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await auth.auth.signInWithPassword({ phone: fixture.phone, password: fixture.password });
  expect(error).toBeNull();
  const bearer = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3100", extraHTTPHeaders: { Host: "app.lvh.me:3100", Authorization: `Bearer ${data.session!.access_token}` } });
  try {
    const permitted = await bearer.get(`/api/v1/sessions/${session}/attendance`);
    expect(permitted.status()).toBe(200);
    expect((await permitted.json()).session.academy_id).toBe(b.id);
    const deniedRead = await bearer.get(`/api/v1/sessions/${c.session}/attendance`);
    expect(deniedRead.status()).toBe(404);
    expect((await deniedRead.json()).error.code).toBe("NOT_FOUND");
    const deniedWrite = await bearer.post(`/api/v1/sessions/${c.session}/check-ins`, { headers: { "Idempotency-Key": randomUUID() }, data: { annual_student_record_id: c.students[0].id, late_after_minutes: 0 } });
    expect(deniedWrite.status()).toBe(404);
    expect((await deniedWrite.json()).error.code).toBe("NOT_FOUND");
    expect(snapshot(c.session)).toEqual(forbiddenBefore);
  } finally { await bearer.dispose(); await auth.auth.signOut(); }
});
