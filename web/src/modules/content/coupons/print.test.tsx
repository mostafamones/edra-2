// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({ loadCouponBatch: vi.fn(), generateCoupons: vi.fn(), revokeCoupon: vi.fn() }));
vi.mock("./actions", () => mocks);
import { CouponPrintDialog } from "./print";

const batch = { id: "batch", created_at: "2026-10-24T10:00:00Z", prefix: "REG", quantity: 3, type_name: "Revision · مراجعة نهائية", level: null, track: null, created_by_name: "Staff", closed: false, redeemed: 1, revoked: 1 };
const coupon = (id: string, code: string, status: string, prefix = "OLD") => ({ id, code, prefix, status, redeemed_at: null, student_name: null, unit_title: null });
const base = [coupon("c1", "AB7K9M3R", "unused"), coupon("c2", "CD7K9M3R", "redeemed"), coupon("c3", "EF7K9M3R", "revoked")];
const reply = (codes = base, userId = "staff") => ({ ok: true, value: { userId, manager: true, codes } });
const print = vi.fn();

function mount(props: Partial<{ batch: typeof batch; userId: string }> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (p: typeof props) => <QueryClientProvider client={client}><CouponPrintDialog academyId="academy" academyName="أكاديمية مونس · Mones" userId={p.userId ?? "staff"} batch={p.batch ?? batch} disabled={false} /></QueryClientProvider>;
  const view = render(ui(props));
  return { ...view, rerender: (next: typeof props) => view.rerender(ui(next)) };
}
async function openPreview() {
  fireEvent.click(screen.getByRole("button", { name: "Print" }));
  return within(await screen.findByRole("dialog", { name: "Print coupons" }));
}
const printAction = (d: ReturnType<typeof within>) => d.getAllByRole("button").find((b: HTMLElement) => /^(Print|Checking…)$/.test(b.textContent ?? "")) as HTMLButtonElement;
async function ready(d: ReturnType<typeof within>) { await waitFor(() => expect(printAction(d).disabled).toBe(false)); }
async function choose(d: ReturnType<typeof within>, name: string) {
  fireEvent.click(d.getByRole("combobox", { name: "Status" }));
  fireEvent.click(await screen.findByRole("option", { name }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("print", print);
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  mocks.loadCouponBatch.mockResolvedValue(reply());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.documentElement.classList.remove("coupon-printing"); });

it("defaults to Unused, offers all four statuses and counts coupons and pages", async () => {
  mount(); const d = await openPreview(); await ready(d);
  expect(d.getByRole("combobox", { name: "Status" }).textContent).toBe("Unused");
  expect(d.getByText("1 coupon · 1 page")).toBeTruthy();
  fireEvent.click(d.getByRole("combobox", { name: "Status" }));
  expect((await screen.findAllByRole("option")).map(o => o.textContent)).toEqual(["Unused", "Redeemed", "Revoked", "All"]);
  fireEvent.click(screen.getByRole("option", { name: "All" }));
  expect(d.getByText("3 coupons · 1 page")).toBeTruthy();
});

it("renders full original-prefix codes, mixed-direction names and text status labels", async () => {
  mount(); const d = await openPreview(); await ready(d); await choose(d, "All");
  const preview = d.getByTestId("coupon-print-preview");
  const codes = [...preview.querySelectorAll(".coupon-card-code")];
  expect(codes.map(c => [c.textContent, c.getAttribute("dir")])).toEqual([["OLD-AB7K-9M3R", "ltr"], ["OLD-CD7K-9M3R", "ltr"], ["OLD-EF7K-9M3R", "ltr"]]);
  expect(within(preview).getAllByText("أكاديمية مونس · Mones")).toHaveLength(3);
  expect(within(preview).getAllByText("Revision · مراجعة نهائية")[0].getAttribute("dir")).toBe("auto");
  expect([...preview.querySelectorAll(".coupon-card-status")].map(s => s.textContent)).toEqual(["Redeemed", "Revoked"]);
});

it("keeps the status selector on no matches and disables printing", async () => {
  mocks.loadCouponBatch.mockResolvedValue(reply([coupon("c2", "CD7K9M3R", "redeemed")]));
  mount(); const d = await openPreview();
  expect(await d.findByText("No matching coupons")).toBeTruthy();
  expect(d.getByText("0 coupons · 0 pages")).toBeTruthy();
  expect(printAction(d).disabled).toBe(true);
  await choose(d, "Redeemed");
  expect(d.getByText("1 coupon · 1 page")).toBeTruthy();
});

it("shows loading, then distinguishes a failed or denied read from no matches and retries", async () => {
  let resolve!: (value: unknown) => void;
  mocks.loadCouponBatch.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  mount(); const d = await openPreview();
  expect(d.getByRole("status", { name: "Loading coupons" })).toBeTruthy();
  expect(printAction(d).disabled).toBe(true);
  await act(async () => resolve({ ok: false, message: "You no longer have access to these coupons." }));
  expect(await d.findByText("You no longer have access to these coupons.")).toBeTruthy();
  expect(d.queryByText("No matching coupons")).toBeNull();
  expect(d.queryByTestId("coupon-print-preview")).toBeNull();
  expect(printAction(d).disabled).toBe(true);
  fireEvent.click(d.getByRole("button", { name: "Retry" }));
  await ready(d);
  expect(d.getByTestId("coupon-print-preview").textContent).toContain("OLD-AB7K-9M3R");
});

it("removes cached codes when a fresh read on open is denied", async () => {
  mount(); let d = await openPreview(); await ready(d);
  fireEvent.click(d.getByRole("button", { name: "Cancel" }));
  mocks.loadCouponBatch.mockResolvedValueOnce({ ok: false, message: "Access denied." });
  d = await openPreview();
  expect(await d.findByText("Access denied.")).toBeTruthy();
  expect(d.queryByText(/OLD-/)).toBeNull();
});

it("revalidates before printing and prints the same content as the preview", async () => {
  mount(); const d = await openPreview(); await ready(d); await choose(d, "All");
  const reads = mocks.loadCouponBatch.mock.calls.length;
  print.mockImplementationOnce(() => {
    expect(document.documentElement.classList.contains("coupon-printing")).toBe(true);
    const printed = screen.getByTestId("coupon-print-document");
    expect(printed.parentElement).toBe(document.body);
    expect(printed.innerHTML).toBe(d.getByTestId("coupon-print-preview").innerHTML);
  });
  fireEvent.click(printAction(d));
  await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  expect(mocks.loadCouponBatch.mock.calls.length).toBe(reads + 1);
  // Cancelling or finishing the browser dialog restores the application.
  act(() => { dispatchEvent(new Event("afterprint")); });
  expect(document.documentElement.classList.contains("coupon-printing")).toBe(false);
  expect(screen.queryByTestId("coupon-print-document")).toBeNull();
  expect(document.activeElement).toBe(printAction(d));
  fireEvent.click(printAction(d));
  await waitFor(() => expect(print).toHaveBeenCalledTimes(2));
  act(() => { dispatchEvent(new Event("afterprint")); });
  expect(mocks.generateCoupons).not.toHaveBeenCalled();
  expect(mocks.revokeCoupon).not.toHaveBeenCalled();
});

it("updates the preview instead of printing when the coupons changed", async () => {
  mount(); const d = await openPreview(); await ready(d);
  mocks.loadCouponBatch.mockResolvedValueOnce(reply([coupon("c1", "AB7K9M3R", "redeemed"), ...base.slice(1)]));
  fireEvent.click(printAction(d));
  expect(await d.findByText("These coupons changed. Review the preview and print again.")).toBeTruthy();
  expect(print).not.toHaveBeenCalled();
  expect(d.getByText("No matching coupons")).toBeTruthy();
});

it("blocks printing when verification fails", async () => {
  mount(); const d = await openPreview(); await ready(d);
  mocks.loadCouponBatch.mockResolvedValueOnce({ ok: false, message: "Access denied." });
  fireEvent.click(printAction(d));
  expect(await d.findByText("Access denied.")).toBeTruthy();
  expect(d.queryByTestId("coupon-print-preview")).toBeNull();
  expect(print).not.toHaveBeenCalled();
});

it("ignores a late verification after the preview closes", async () => {
  mount(); const d = await openPreview(); await ready(d);
  let resolve!: (value: unknown) => void;
  mocks.loadCouponBatch.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  fireEvent.click(printAction(d));
  fireEvent.keyDown(screen.getByRole("dialog", { name: "Print coupons" }), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await act(async () => resolve(reply()));
  expect(print).not.toHaveBeenCalled();
  expect(screen.queryByTestId("coupon-print-document")).toBeNull();
});

it("never shows codes returned for another account and restarts for a new batch", async () => {
  mocks.loadCouponBatch.mockResolvedValueOnce(reply(base, "other"));
  const view = mount(); let d = await openPreview();
  expect(await d.findByText("Your account changed. Reload this page.")).toBeTruthy();
  expect(d.queryByText(/OLD-/)).toBeNull();
  fireEvent.click(d.getByRole("button", { name: "Cancel" }));
  mocks.loadCouponBatch.mockResolvedValue(reply([coupon("n1", "GH7K9M3R", "unused", "NEW")]));
  view.rerender({ batch: { ...batch, id: "other-batch" } });
  d = await openPreview(); await ready(d);
  expect(mocks.loadCouponBatch).toHaveBeenLastCalledWith({ academyId: "academy", batchId: "other-batch" });
  expect(d.getByTestId("coupon-print-preview").textContent).toContain("NEW-GH7K-9M3R");
  expect(d.queryByText(/OLD-/)).toBeNull();
});
