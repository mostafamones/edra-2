import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ loadCouponOptions: vi.fn(), loadCouponBatches: vi.fn() }));
vi.mock("./actions", () => api);
import { couponBatchesOptions, couponRootKey } from "./queries";

it("reuses a warm read, invalidates only its academy and separates account keys", async () => {
  api.loadCouponBatches.mockImplementation(async ({ academyId }: { academyId: string }) => ({ ok: true, value: { userId: "one", batches: [{ id: academyId }] } }));
  const cache = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
  const a = couponBatchesOptions("one", "a", "year", null, "", 0);
  const b = couponBatchesOptions("one", "b", "year", null, "", 0);
  await cache.fetchQuery(a); await cache.fetchQuery(b); await cache.fetchQuery(a);
  expect(api.loadCouponBatches).toHaveBeenCalledTimes(2);
  await cache.invalidateQueries({ queryKey: couponRootKey("one", "a") });
  await cache.fetchQuery(b); await cache.fetchQuery(a);
  expect(api.loadCouponBatches).toHaveBeenCalledTimes(3);
  expect(cache.getQueryData(couponBatchesOptions("two", "a", "year", null, "", 0).queryKey)).toBeUndefined();
  cache.clear();
});

it("a late old-account response cannot fill the new account's key", async () => {
  let resolve!: (value: unknown) => void;
  api.loadCouponBatches.mockReturnValue(new Promise(done => { resolve = done; }));
  const cache = new QueryClient();
  const pending = cache.fetchQuery(couponBatchesOptions("old", "a", "year", null, "", 0));
  resolve({ ok: true, value: { userId: "old", batches: [{ id: "old-data" }] } });
  await pending;
  expect(cache.getQueryData(couponBatchesOptions("new", "a", "year", null, "", 0).queryKey)).toBeUndefined();
  cache.clear();
});
