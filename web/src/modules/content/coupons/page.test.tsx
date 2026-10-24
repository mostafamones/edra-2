// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({ loadCouponOptions: vi.fn(), loadCoupons: vi.fn(), createCouponType: vi.fn(), generateCoupons: vi.fn(), revokeCoupon: vi.fn(), changeCouponPrefix: vi.fn(), updateCouponType: vi.fn(), removeCouponType: vi.fn() }));
vi.mock("./actions", () => mocks);
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "staff" } }), AcademyGate: ({ children }: { children: (academy: { id: string }) => React.ReactNode }) => children({ id: "academy" }) }));
import { CouponsPage } from "./page";
const scope = { id: "scope", yearId: "year", year: 2026, closed: false, levelId: "grade", level: "Grade", trackId: "science", track: "Science", prefix: "S2-SCI" };
function open() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CouponsPage /></QueryClientProvider>); }
async function showTypes() { fireEvent.mouseDown(await screen.findByRole("tab", { name: "Coupon types" }), { button: 0, ctrlKey: false }); }
async function generate() {
  fireEvent.click(await screen.findByRole("button", { name: "Generate coupons" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Generate coupons" }));
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  mocks.loadCouponOptions.mockResolvedValue({ ok: true, value: { userId: "staff", programs: [scope], types: [] } });
  mocks.loadCoupons.mockResolvedValue({ ok: true, value: { userId: "staff", manager: true, codes: [], hasMore: false } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("shows only the selected audience's types and default", async () => {
  const common = { yearId: "year", trackId: null, name: "Regular", prefix: "REG", isDefault: true, allTracks: true };
  mocks.loadCouponOptions.mockResolvedValue({ ok: true, value: { userId: "staff", programs: [scope], types: [
    { ...common, id: "academy", programId: null, levelId: null },
    { ...common, id: "grade", programId: "scope", levelId: "grade" },
    { ...common, id: "track", programId: "scope", levelId: "grade", trackId: "science", prefix: "S2-SCI-REG", allTracks: false },
  ] } });
  open();
  fireEvent.click(await screen.findByRole("combobox", { name: "Coupon type" }));
  expect(screen.queryByText("All grades", { exact: true })).toBeNull();
  expect(await screen.findByText("Grade · Science", { exact: true })).toBeTruthy();
  expect(screen.queryByRole("option", { name: "Regular · REG" })).toBeNull();
  expect(screen.getAllByRole("option").filter(option => option.textContent?.includes("Default"))).toHaveLength(1);
});
it("protects defaults from removal", async () => {
  open(); await screen.findByText("No coupons"); await showTypes();
  expect((await screen.findByRole("button", { name: /^Remove type/ }) as HTMLButtonElement).disabled).toBe(true);
});
it("preserves edited fields and request identity when a type update needs retrying", async () => {
  mocks.updateCouponType.mockResolvedValue({ ok: false, message: "Please retry." });
  open(); await showTypes(); fireEvent.click(await screen.findByRole("button", { name: /^Edit type/ }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Standard" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
  await within(dialog).findByText("Please retry.");
  expect((within(dialog).getByLabelText("Name") as HTMLInputElement).value).toBe("Standard");
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mocks.updateCouponType).toHaveBeenCalledTimes(2));
  expect(mocks.updateCouponType.mock.calls[0][0]).toEqual(mocks.updateCouponType.mock.calls[1][0]);
});
it("does not offer type removal to instructors", async () => {
  mocks.loadCoupons.mockResolvedValue({ ok: true, value: { userId: "staff", manager: false, codes: [], hasMore: false } });
  open(); await screen.findByText("No coupons"); await showTypes();
  expect(screen.queryByRole("button", { name: /^Remove type/ })).toBeNull();
});
it("confirms removal of a custom type and reports archiving", async () => {
  mocks.loadCouponOptions.mockResolvedValue({ ok: true, value: { userId: "staff", programs: [scope], types: [{ id: "custom", programId: "scope", yearId: "year", levelId: "grade", trackId: "science", name: "Revision", prefix: "S2-SCI-REV", isDefault: false, allTracks: false }] } });
  mocks.removeCouponType.mockResolvedValue({ ok: true, value: { mode: "archived" } });
  open();
  await screen.findByText("No coupons"); await showTypes();
  fireEvent.click(await screen.findByRole("button", { name: /^Remove type Revision/ }));
  expect(mocks.removeCouponType).not.toHaveBeenCalled();
  const dialog = screen.getByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Remove type" }));
  await waitFor(() => expect(mocks.removeCouponType).toHaveBeenCalledWith(expect.objectContaining({ typeId: "custom" })));
  expect(await screen.findByText("Coupon type archived.")).toBeTruthy();
});
it("shows a retryable loading error instead of claiming the academy has no scopes", async () => {
  mocks.loadCouponOptions.mockResolvedValueOnce({ ok: false, message: "Could not load coupon settings. Refresh and try again." });
  open();
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText("No academic scopes")).toBeNull();
  expect(screen.queryByLabelText("New type")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByLabelText("Audience")).toBeTruthy();
});
it("ignores a legacy global type and generates the exact audience's default", async () => {
  mocks.loadCouponOptions.mockResolvedValue({ ok: true, value: { userId: "staff", programs: [scope], types: [{ id: "academy-wide", programId: null, yearId: "year", levelId: null, trackId: null, name: "Regular", prefix: "REG", isDefault: true, allTracks: true }] } });
  mocks.generateCoupons.mockResolvedValue({ ok: false, message: "Retry generation." });
  open();
  await generate();
  await waitFor(() => expect(mocks.generateCoupons).toHaveBeenCalledWith(expect.objectContaining({ typeId: null, levelId: "grade", trackId: "science" })));
  expect(screen.queryByText("No academic scopes")).toBeNull();
});
it("replaces the whole table with an empty state and keeps generation controls", async () => {
  open(); expect(await screen.findByText("No coupons")).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.queryByLabelText("Number of coupons")).toBeNull();
  expect((screen.getByRole("button", { name: "Generate coupons" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Generate coupons" }));
  expect(screen.getByLabelText("Number of coupons")).toBeTruthy();
  expect(mocks.generateCoupons).not.toHaveBeenCalled();
});
it("keeps the list filter unchanged when generation is cancelled", async () => {
  open(); await screen.findByText("No coupons");
  const calls = mocks.loadCoupons.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Generate coupons" }));
  expect(within(screen.getByRole("dialog")).getByLabelText("Number of coupons")).toBeTruthy();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("combobox", { name: "Coupon type" }).textContent).toBe("All types");
  expect(mocks.loadCoupons).toHaveBeenCalledTimes(calls);
  expect(mocks.generateCoupons).not.toHaveBeenCalled();
});
it("creates a type in the chosen scope and retains generation request identity on retry", async () => {
  mocks.createCouponType.mockImplementation(async () => {
    mocks.loadCouponOptions.mockResolvedValue({ ok: true, value: { userId: "staff", programs: [scope], types: [{ id: "type", programId: "scope", yearId: "year", levelId: "grade", trackId: "science", name: "Revision", prefix: "REV", isDefault: false, allTracks: false }] } });
    return { ok: true, value: { id: "type" } };
  });
  mocks.generateCoupons.mockResolvedValue({ ok: false, message: "Retry generation." });
  open(); await showTypes(); fireEvent.click(screen.getByRole("button", { name: "New type" }));
  fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Revision" } });
  expect((screen.getByLabelText("Type prefix") as HTMLInputElement).value).toBe("REV");
  expect(screen.getByText("S2-SCI-REV-XXXX-XXXX")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Create type" }));
  await screen.findByText("Coupon type created.");
  expect(mocks.createCouponType).toHaveBeenCalledWith(expect.objectContaining({ trackId: "science", prefix: "REV" }));
  expect(mocks.createCouponType.mock.calls[0][0].allTracks).toBeUndefined();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Coupons" }), { button: 0, ctrlKey: false });
  await waitFor(() => expect((screen.getByRole("button", { name: "Generate coupons" }) as HTMLButtonElement).disabled).toBe(false));
  await generate();
  await screen.findByText("Retry generation.");
  fireEvent.click(screen.getByRole("button", { name: "Generate coupons" }));
  await waitFor(() => expect(mocks.generateCoupons).toHaveBeenCalledTimes(2));
  expect(mocks.generateCoupons.mock.calls[0][0]).toEqual(mocks.generateCoupons.mock.calls[1][0]);
  expect(mocks.generateCoupons.mock.calls[0][0]).toMatchObject({ academyId: "academy", typeId: "type", quantity: 1 });
});
it("can generate default coupons for a scope that has no content or saved types", async () => {
  mocks.generateCoupons.mockResolvedValue({ ok: false, message: "Retry generation." });
  open();
  await generate();
  await waitFor(() => expect(mocks.generateCoupons).toHaveBeenCalledWith(expect.objectContaining({ academyId: "academy", yearId: "year", levelId: "grade", trackId: "science", typeId: null, quantity: 1 })));
});
it("does not display coupons returned for a different account", async () => {
  mocks.loadCoupons.mockResolvedValue({ ok: true, value: { userId: "other", manager: true, hasMore: false, codes: [{ id: "coupon", code: "AB7K9M3R" }] } });
  open(); expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Your account changed. Reload this page.");
  expect(screen.queryByText("AB7K-9M3R")).toBeNull();
});
it("edits the type suffix while keeping its audience prefix", async () => {
  mocks.loadCouponOptions.mockResolvedValue({ ok: true, value: { userId: "staff", programs: [scope], types: [{ id: "regular", programId: "scope", yearId: "year", levelId: "grade", trackId: "science", name: "Regular", prefix: "S2-SCI-REG", isDefault: true, allTracks: false }] } });
  mocks.updateCouponType.mockResolvedValue({ ok: true, value: undefined });
  open();
  await showTypes(); fireEvent.click(await screen.findByRole("button", { name: /^Edit type/ }));
  const dialog = screen.getByRole("dialog");
  expect((within(dialog).getByLabelText("Type prefix") as HTMLInputElement).value).toBe("REG");
  fireEvent.change(within(dialog).getByLabelText("Type prefix"), { target: { value: "GEN" } });
  expect(within(dialog).getByText("S2-SCI-GEN-XXXX-XXXX")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mocks.updateCouponType).toHaveBeenCalledWith(expect.objectContaining({ academyId: "academy", typeId: "regular", prefix: "GEN" })));
});
