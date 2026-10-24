// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const mocks = vi.hoisted(() => ({ loadCouponOptions: vi.fn(), loadCouponBatches: vi.fn(), loadCouponBatch: vi.fn(), createCouponType: vi.fn(), generateCoupons: vi.fn(), revokeCoupon: vi.fn(), changeCouponPrefix: vi.fn(), renameCouponType: vi.fn(), deleteCouponType: vi.fn() }));
vi.mock("./actions", () => mocks);
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "staff" } }), AcademyGate: ({ children }: { children: (academy: { id: string }) => React.ReactNode }) => children({ id: "academy" }) }));
import { TooltipProvider } from "@/components/ui/tooltip";
import { CouponsPage } from "./page";
const scope = { id: "scope", yearId: "year", year: 2026, closed: false, levelId: "grade", level: "Grade", trackId: "science", track: "Science" };
const batch = { id: "batch", created_at: "2026-10-24T10:00:00Z", prefix: "REG", quantity: 1, type_name: "Revision", level: "Grade", track: "Science", created_by_name: "Staff", closed: false, redeemed: 0, revoked: 0 };
function open() { if (!document.getElementById("header-actions")) document.body.insertAdjacentHTML("afterbegin", "<div id=\"header-actions\"></div>"); render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TooltipProvider><CouponsPage /></TooltipProvider></QueryClientProvider>); }
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = () => {};
  mocks.loadCouponOptions.mockResolvedValue({ ok: true, value: { userId: "staff", programs: [scope], types: [] } });
  mocks.loadCouponBatches.mockResolvedValue({ ok: true, value: { userId: "staff", manager: true, batches: [], hasMore: false } });
  mocks.loadCouponBatch.mockResolvedValue({ ok: true, value: { userId: "staff", manager: true, codes: [{ id: "c1", code: "AB7K9M3R", prefix: "REG", status: "unused", redeemed_at: null, student_name: null, unit_title: null }] } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const revision = { id: "type", programId: "scope", yearId: "year", levelId: "grade", trackId: "science", name: "Revision", prefix: "REVS", isDefault: false, allTracks: false };
const academyPass = { id: "pass", programId: null, yearId: "year", levelId: null, trackId: null, name: "Pass", prefix: "PAS", isDefault: false, allTracks: true };
function withTypes(types: unknown[]) { mocks.loadCouponOptions.mockResolvedValue({ ok: true, value: { userId: "staff", programs: [scope], types } }); }
async function openGenerate() {
  await waitFor(() => expect((screen.getByRole("button", { name: "Generate coupons" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Generate coupons" })); return within(await screen.findByRole("dialog"));
}

it("shows a retryable loading error and recovers the coupon settings", async () => {
  mocks.loadCouponOptions.mockResolvedValueOnce({ ok: false, message: "Could not load coupon settings. Refresh and try again." });
  open();
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "New type" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("button", { name: "New type" })).toBeTruthy();
});
it("generates an existing academy-wide type", async () => {
  withTypes([{ ...academyPass, id: "academy-wide", name: "Regular", prefix: "REG", isDefault: true }]);
  mocks.generateCoupons.mockResolvedValue({ ok: false, message: "Retry generation." });
  open(); const dialog = await openGenerate();
  fireEvent.click(dialog.getByRole("button", { name: "Generate" }));
  await waitFor(() => expect(mocks.generateCoupons).toHaveBeenCalledWith(expect.objectContaining({ typeId: "academy-wide", levelId: null })));
});
it("replaces the whole table with an empty state", async () => {
  open(); expect(await screen.findByText("No coupons")).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
});
it("defaults generation to the whole academy's Regular and retries with the same request", async () => {
  mocks.generateCoupons.mockResolvedValue({ ok: false, message: "Retry generation." });
  open(); const dialog = await openGenerate();
  expect(dialog.getByRole("combobox", { name: "Program" }).textContent).toContain("Whole academy");
  expect(dialog.getByRole("combobox", { name: "Coupon type" }).textContent).toContain("Regular · REG");
  expect((dialog.getByLabelText("Number of coupons") as HTMLInputElement).value).toBe("10");
  fireEvent.click(dialog.getByRole("button", { name: "Generate" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Retry generation."));
  fireEvent.click(dialog.getByRole("button", { name: "Generate" }));
  await waitFor(() => expect(mocks.generateCoupons).toHaveBeenCalledTimes(2));
  expect(mocks.generateCoupons.mock.calls[0][0]).toEqual(mocks.generateCoupons.mock.calls[1][0]);
  expect(mocks.generateCoupons.mock.calls[0][0]).toMatchObject({ academyId: "academy", yearId: "year", levelId: null, typeId: null, quantity: 10 });
});
it("steps the coupon count by five, or by one with Shift, and allows retyping", async () => {
  open(); const dialog = await openGenerate(); const input = dialog.getByLabelText("Number of coupons") as HTMLInputElement;
  fireEvent.click(dialog.getByRole("button", { name: "Increase" })); expect(input.value).toBe("15");
  fireEvent.click(dialog.getByRole("button", { name: "Decrease" }), { shiftKey: true }); expect(input.value).toBe("14");
  fireEvent.change(input, { target: { value: "" } }); expect(input.value).toBe("");
  fireEvent.change(input, { target: { value: "25x" } }); expect(input.value).toBe("25");
});
it("generates a grade type and opens the new batch", async () => {
  withTypes([revision]);
  mocks.generateCoupons.mockResolvedValue({ ok: true, value: { batchId: "new", codes: [{ id: "c1", code: "AB7K9M3R", prefix: "REG" }] } });
  open(); const dialog = await openGenerate();
  fireEvent.click(dialog.getByRole("combobox", { name: "Program" }));
  fireEvent.click(await screen.findByRole("option", { name: "Grade · Science" }));
  await waitFor(() => expect(dialog.getByRole("combobox", { name: "Coupon type" }).textContent).toContain("Revision"));
  fireEvent.click(dialog.getByRole("button", { name: "Generate" }));
  await waitFor(() => expect(mocks.generateCoupons).toHaveBeenCalledWith(expect.objectContaining({ levelId: "grade", trackId: "science", typeId: "type" })));
  expect(await within(await screen.findByRole("dialog")).findByText("REG-AB7K-9M3R")).toBeTruthy();
  expect(mocks.loadCouponBatch).toHaveBeenCalledWith({ academyId: "academy", batchId: "new" });
});
it("adds an academy-wide type inline", async () => {
  mocks.createCouponType.mockResolvedValue({ ok: true, value: { id: "pass" } });
  open(); fireEvent.click(await screen.findByRole("button", { name: "New type" }));
  fireEvent.change(screen.getByLabelText("New type name"), { target: { value: "Pass" } });
  fireEvent.change(screen.getByLabelText("New type prefix"), { target: { value: "pas" } });
  expect(screen.queryByLabelText("All tracks")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add type" }));
  await waitFor(() => expect(mocks.createCouponType).toHaveBeenCalledWith(expect.objectContaining({ yearId: "year", levelId: null, trackId: null, name: "Pass", prefix: "PAS", allTracks: true })));
  await waitFor(() => expect(screen.queryByLabelText("New type name")).toBeNull());
});
it("cancels an inline type with Escape", async () => {
  open(); fireEvent.click(await screen.findByRole("button", { name: "New type" }));
  fireEvent.keyDown(screen.getByLabelText("New type name"), { key: "Escape" });
  expect(screen.queryByLabelText("New type name")).toBeNull();
  expect(screen.getByRole("button", { name: "New type" })).toBeTruthy();
});
it("edits the academy Regular prefix in place and cannot delete it", async () => {
  mocks.changeCouponPrefix.mockResolvedValue({ ok: true, value: undefined });
  open(); fireEvent.change(await screen.findByLabelText("Prefix of Regular"), { target: { value: "GEN" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mocks.changeCouponPrefix).toHaveBeenCalledWith(expect.objectContaining({ levelId: null, typeId: null, prefix: "GEN" })));
  expect(screen.queryByRole("button", { name: "Delete Regular" })).toBeNull();
});
it("renames and deletes a custom type", async () => {
  withTypes([academyPass]);
  mocks.renameCouponType.mockResolvedValue({ ok: true, value: undefined });
  mocks.deleteCouponType.mockResolvedValue({ ok: true, value: undefined });
  open(); fireEvent.click(await screen.findByRole("button", { name: "Delete Pass" }));
  fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete type" }));
  await waitFor(() => expect(mocks.deleteCouponType).toHaveBeenCalledWith(expect.objectContaining({ academyId: "academy", typeId: "pass" })));
  fireEvent.change(screen.getByLabelText("Name of Pass"), { target: { value: "Finals" } });
  expect(screen.queryByRole("button", { name: "Delete Pass" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mocks.renameCouponType).toHaveBeenCalledWith(expect.objectContaining({ academyId: "academy", typeId: "pass", name: "Finals" })));
});
it("does not display batches returned for a different account", async () => {
  mocks.loadCouponBatches.mockResolvedValue({ ok: true, value: { userId: "other", manager: true, hasMore: false, batches: [batch] } });
  open(); expect((await screen.findByRole("alert")).textContent).toContain("Your account changed. Reload this page.");
  expect(screen.queryByRole("button", { name: "Details" })).toBeNull();
});
it("lists batches and opens a batch's coupons in a sheet", async () => {
  mocks.loadCouponBatches.mockResolvedValue({ ok: true, value: { userId: "staff", manager: true, hasMore: false, batches: [batch, { ...batch, id: "academy-batch", level: null, track: null }] } });
  open(); expect(await screen.findByText("Whole academy", { selector: "td" })).toBeTruthy();
  fireEvent.click(screen.getAllByRole("button", { name: "Details" })[0]);
  expect(await within(await screen.findByRole("dialog")).findByText("REG-AB7K-9M3R")).toBeTruthy();
  expect(mocks.loadCouponBatch).toHaveBeenCalledWith({ academyId: "academy", batchId: "batch" });
});
it("filters batches by type prefix tab and program", async () => {
  withTypes([revision, academyPass]);
  open(); fireEvent.mouseDown(await screen.findByRole("tab", { name: "REV" }), { button: 0 });
  await waitFor(() => expect(mocks.loadCouponBatches).toHaveBeenLastCalledWith(expect.objectContaining({ prefix: "REV" })));
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  fireEvent.click(within(await screen.findByRole("dialog")).getByRole("combobox", { name: "Program" }));
  fireEvent.click(await screen.findByRole("option", { name: "Whole academy" }));
  await waitFor(() => expect(mocks.loadCouponBatches).toHaveBeenLastCalledWith(expect.objectContaining({ yearId: "year", levelId: null, academyWide: true })));
  expect(screen.queryByRole("tab", { name: "REV" })).toBeNull();
});
it("hides closed-year scopes", async () => {
  mocks.loadCouponOptions.mockResolvedValue({ ok: true, value: { userId: "staff", programs: [{ ...scope, closed: true }], types: [] } });
  open(); expect(await screen.findByText("No coupons")).toBeTruthy();
  expect(screen.queryByText("Coupon types")).toBeNull();
  expect((screen.getByRole("button", { name: "Generate coupons" }) as HTMLButtonElement).disabled).toBe(true);
});
