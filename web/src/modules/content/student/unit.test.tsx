// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LearningUnit } from "../access/types";
const mocks = vi.hoisted(() => ({ loadLearningUnit: vi.fn(), redeemUnitCode: vi.fn(), extendMyUnitAccess: vi.fn(), auth: vi.fn() }));
vi.mock("../access/actions", () => mocks);
vi.mock("@/modules/auth", () => ({ useAuth: mocks.auth }));
vi.mock("./material", () => ({ StudentMaterial: () => <button>Open protected material</button> }));
import { StudentLearningUnit } from "./unit";
const userId = "student", academyId = "academy";
function unit(): LearningUnit { return { id: "unit", title: "Revision lesson", description: "", accessDays: 7, extensionAvailable: true, prerequisites: [], prerequisitesMet: true, couponType: null,
  access: { status: "locked", expiresAt: null, grantId: null }, items: [{ id: "material", kind: "document", title: "Notes", available: false, assessmentKind: null }] }; }
function open(initial = unit()) {
  mocks.loadLearningUnit.mockResolvedValue({ ok: true, value: { userId, unit: initial } });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={cache}><StudentLearningUnit academyId={academyId} academySlug="academy" userId={userId} initial={initial} /></QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockReturnValue({ user: { id: userId }, loading: false }); });
afterEach(cleanup);
it("shows acknowledged unit completion and material completion independently of access", async () => {
  const initial = unit();
  initial.items.push({ id: "video", kind: "explanation", title: "Lesson video", available: false, assessmentKind: null });
  initial.progress = { completed: 1, total: 2, items: [{ itemId: "video", completed: true, watchedSeconds: 90, durationSeconds: 100, positionSeconds: 95 }] };
  open(initial);
  expect(await screen.findByText("1 of 2 completed")).toBeTruthy();
  expect(screen.getByText("Completed")).toBeTruthy();
  expect(screen.getByRole("progressbar", { name: "Unit completion" }).getAttribute("aria-valuenow")).toBe("50");
  expect(screen.queryByRole("button", { name: "Open protected material" })).toBeNull();
});
it.each(["locked", "revoked"] as const)("locks assignment links when unit access is %s, even with stale available metadata", async status => {
  const initial = unit(); initial.access.status = status;
  initial.items = [{ id: "assignment", kind: "assessment", title: "Homework", available: true, assessmentKind: "assignment", assessmentId: "homework" }];
  open(initial);
  expect(await screen.findByText("Homework")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Open assignment" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Open protected material" })).toBeNull();
  expect(screen.getAllByText("Locked").length).toBeGreaterThan(0);
});
it.each(["active", "expired"] as const)("opens available assignments with %s unit access", async status => {
  const initial = unit(); initial.access.status = status;
  initial.items = [{ id: "assignment", kind: "assessment", title: "Homework", available: true, assessmentKind: "assignment", assessmentId: "homework" }];
  open(initial);
  expect((await screen.findByRole("link", { name: "Open assignment" })).getAttribute("href")).toContain("assignments/homework");
});
it("does not link an unavailable assignment even with active unit access", async () => {
  const initial = unit(); initial.access.status = "active";
  initial.items = [{ id: "assignment", kind: "assessment", title: "Homework", available: false, assessmentKind: "assignment", assessmentId: "homework" }];
  open(initial);
  expect(await screen.findByText("Unavailable")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Open assignment" })).toBeNull();
});
it("shows unmet requirements and disables coupon redemption and self-extension", async () => {
  const initial = unit(); initial.prerequisitesMet = false;
  initial.prerequisites = [{ unitId: "previous", assessmentId: "homework", kind: "assignment", unitTitle: "Previous lesson", title: "Homework", submitted: false }];
  initial.access = { status: "expired", expiresAt: "2026-10-20T12:00:00Z", grantId: "grant" };
  open(initial);
  expect(await screen.findByRole("link", { name: "Previous lesson · Homework" })).toBeTruthy();
  expect((screen.getByLabelText("Coupon") as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Redeem coupon" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Use 48-hour extension" }) as HTMLButtonElement).disabled).toBe(true);
  expect(mocks.redeemUnitCode).not.toHaveBeenCalled();
});
it("keeps already-authorized material available when prerequisites subsequently change", async () => {
  const initial = unit(); initial.prerequisitesMet = false;
  initial.access = { status: "active", expiresAt: "2026-11-20T12:00:00Z", grantId: "grant" };
  initial.items[0].available = true;
  open(initial);
  expect(await screen.findByRole("button", { name: "Open protected material" })).toBeTruthy();
});
it("shows missing activation separately from an already submitted assessment", async () => {
  const initial = unit(); initial.prerequisitesMet = false;
  initial.prerequisites = [
    { unitId: "previous", assessmentId: null, kind: "access", unitTitle: "Fundamentals", title: "Previously unlocked", submitted: false },
    { unitId: "previous", assessmentId: "homework", kind: "assignment", unitTitle: "Fundamentals", title: "Homework", submitted: true },
  ];
  open(initial);
  expect(await screen.findByRole("link", { name: "Fundamentals · Previously unlocked" })).toBeTruthy();
  expect(screen.getByText("Submitted")).toBeTruthy();
  expect(screen.getByText("Required")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Redeem coupon" }) as HTMLButtonElement).disabled).toBe(true);
});
it("keeps locked document metadata visible without opening protected material or offering an initial extension", async () => {
  open(); await screen.findByText("Notes");
  expect(screen.queryByRole("button", { name: "Open protected material" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Use 48-hour extension" })).toBeNull();
});
it("retains the code and request identity when redemption must be retried", async () => {
  mocks.redeemUnitCode.mockResolvedValue({ ok: false, message: "Please retry." }); open();
  fireEvent.change(await screen.findByLabelText("Coupon"), { target: { value: "AB7K-9M3R" } });
  fireEvent.click(screen.getByRole("button", { name: "Redeem coupon" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Redeem coupon" }));
  await waitFor(() => expect(mocks.redeemUnitCode).toHaveBeenCalledTimes(2));
  expect(mocks.redeemUnitCode.mock.calls[0][0]).toEqual(mocks.redeemUnitCode.mock.calls[1][0]);
  expect(mocks.redeemUnitCode.mock.calls[0][0].code).toBe("AB7K9M3R");
  expect((screen.getByLabelText("Coupon") as HTMLInputElement).value).toContain("AB7K");
});
it("offers the annual extension only on expired access while the allowance remains", async () => {
  const initial = unit(); initial.access = { status: "expired", expiresAt: "2026-10-20T12:00:00Z", grantId: "grant" }; open(initial);
  expect(await screen.findByRole("button", { name: "Use 48-hour extension" })).toBeTruthy();
});
it("does not show another account's cached learning unit", () => {
  mocks.auth.mockReturnValue({ user: { id: "different-student" }, loading: false }); open();
  expect(screen.queryByText("Revision lesson")).toBeNull();
  expect(screen.queryByLabelText("Coupon")).toBeNull();
  expect(mocks.loadLearningUnit).not.toHaveBeenCalled();
});
