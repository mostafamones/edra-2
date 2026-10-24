// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({ loadCouponOptions: vi.fn(), loadCoupons: vi.fn(), createCouponType: vi.fn(), generateCoupons: vi.fn(), revokeCoupon: vi.fn(), changeCouponPrefix: vi.fn() }));
vi.mock("./actions", () => mocks);
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "staff" } }), AcademyGate: ({ children }: { children: (academy: { id: string }) => React.ReactNode }) => children({ id: "academy" }) }));
import { CouponsPage } from "./page";
const scope = { id: "scope", yearId: "year", year: 2026, closed: false, levelId: "grade", level: "Grade", trackId: "science", track: "Science" };
function open() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CouponsPage /></QueryClientProvider>); }
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  mocks.loadCouponOptions.mockResolvedValue({ ok: true, value: { userId: "staff", programs: [scope], types: [] } });
  mocks.loadCoupons.mockResolvedValue({ ok: true, value: { userId: "staff", manager: true, codes: [], hasMore: false } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("replaces the whole table with an empty state and keeps generation controls", async () => {
  open(); expect(await screen.findByText("No coupons")).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.getByLabelText("Number of coupons")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Generate coupons" }) as HTMLButtonElement).disabled).toBe(true);
});
it("creates a type in the chosen scope and retains generation request identity on retry", async () => {
  mocks.createCouponType.mockImplementation(async () => {
    mocks.loadCouponOptions.mockResolvedValue({ ok: true, value: { userId: "staff", programs: [scope], types: [{ id: "type", programId: "scope", yearId: "year", levelId: "grade", trackId: "science", name: "Revision", prefix: "REV", isDefault: false, allTracks: false }] } });
    return { ok: true, value: { id: "type" } };
  });
  mocks.generateCoupons.mockResolvedValue({ ok: false, message: "Retry generation." });
  open(); fireEvent.change(await screen.findByLabelText("New type"), { target: { value: "Revision" } });
  fireEvent.change(screen.getByLabelText("Prefix"), { target: { value: "REV" } });
  fireEvent.click(screen.getByRole("button", { name: "Create type" }));
  await waitFor(() => expect((screen.getByRole("button", { name: "Generate coupons" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Generate coupons" }));
  await screen.findByText("Retry generation.");
  fireEvent.click(screen.getByRole("button", { name: "Generate coupons" }));
  await waitFor(() => expect(mocks.generateCoupons).toHaveBeenCalledTimes(2));
  expect(mocks.generateCoupons.mock.calls[0][0]).toEqual(mocks.generateCoupons.mock.calls[1][0]);
  expect(mocks.generateCoupons.mock.calls[0][0]).toMatchObject({ academyId: "academy", typeId: "type", quantity: 1 });
});
it("does not display coupons returned for a different account", async () => {
  mocks.loadCoupons.mockResolvedValue({ ok: true, value: { userId: "other", manager: true, hasMore: false, codes: [{ id: "coupon", code: "AB7K9M3R" }] } });
  open(); expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Your account changed. Reload this page.");
  expect(screen.queryByText("AB7K-9M3R")).toBeNull();
});
it("selects the shared Regular default and lets staff edit its prefix", async () => {
  mocks.loadCouponOptions.mockResolvedValue({ ok: true, value: { userId: "staff", programs: [scope], types: [{ id: "regular", programId: "whole-grade", yearId: "year", levelId: "grade", trackId: null, name: "Regular", prefix: "REG", isDefault: true, allTracks: true }] } });
  mocks.changeCouponPrefix.mockResolvedValue({ ok: true, value: undefined });
  open();
  fireEvent.change(await screen.findByLabelText("Regular prefix"), { target: { value: "GEN" } });
  expect((screen.getByRole("button", { name: "Generate coupons" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Save prefix" }));
  await waitFor(() => expect(mocks.changeCouponPrefix).toHaveBeenCalledWith(expect.objectContaining({ academyId: "academy", typeId: "regular", prefix: "GEN" })));
});
