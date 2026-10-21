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
function unit(): LearningUnit { return { id: "unit", title: "Revision lesson", description: "", accessDays: 7, extensionAvailable: true,
  access: { status: "locked", expiresAt: null, grantId: null }, items: [{ id: "material", kind: "document", title: "Notes", available: false, assessmentKind: null }] }; }
function open(initial = unit()) {
  mocks.loadLearningUnit.mockResolvedValue({ ok: true, value: { userId, unit: initial } });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={cache}><StudentLearningUnit academyId={academyId} academySlug="academy" userId={userId} initial={initial} /></QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockReturnValue({ user: { id: userId }, loading: false }); });
afterEach(cleanup);
it("keeps locked document metadata visible without opening protected material or offering an initial extension", async () => {
  open(); await screen.findByText("Notes");
  expect(screen.queryByRole("button", { name: "Open protected material" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Use 48-hour extension" })).toBeNull();
});
it("retains the code and request identity when redemption must be retried", async () => {
  mocks.redeemUnitCode.mockResolvedValue({ ok: false, message: "Please retry." }); open();
  fireEvent.change(await screen.findByLabelText("Unit code"), { target: { value: "ABCD-ABCD ABCDABCDABCDABCDABCDABCD" } });
  fireEvent.click(screen.getByRole("button", { name: "Redeem code" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Redeem code" }));
  await waitFor(() => expect(mocks.redeemUnitCode).toHaveBeenCalledTimes(2));
  expect(mocks.redeemUnitCode.mock.calls[0][0]).toEqual(mocks.redeemUnitCode.mock.calls[1][0]);
  expect(mocks.redeemUnitCode.mock.calls[0][0].code).toBe("abcdabcdabcdabcdabcdabcdabcdabcd");
  expect((screen.getByLabelText("Unit code") as HTMLInputElement).value).toContain("ABCD");
});
it("offers the annual extension only on expired access while the allowance remains", async () => {
  const initial = unit(); initial.access = { status: "expired", expiresAt: "2026-10-20T12:00:00Z", grantId: "grant" }; open(initial);
  expect(await screen.findByRole("button", { name: "Use 48-hour extension" })).toBeTruthy();
});
it("does not show another account's cached learning unit", () => {
  mocks.auth.mockReturnValue({ user: { id: "different-student" }, loading: false }); open();
  expect(screen.queryByText("Revision lesson")).toBeNull();
  expect(screen.queryByLabelText("Unit code")).toBeNull();
  expect(mocks.loadLearningUnit).not.toHaveBeenCalled();
});
