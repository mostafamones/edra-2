import { queryOptions } from "@tanstack/react-query";
import { unwrapContent } from "../types";
import { loadCouponBatch, loadCouponBatches, loadCouponOptions } from "./actions";

export const couponRootKey = (userId: string, academyId: string) => ["content-coupons", userId, academyId] as const;

export function couponOptions(userId: string, academyId: string) {
  return queryOptions({ queryKey: [...couponRootKey(userId, academyId), "options"], enabled: !!userId,
    queryFn: async () => {
      const result = unwrapContent(await loadCouponOptions({ academyId }));
      if (result.userId !== userId) throw new Error("Your account changed. Reload this page.");
      return result;
    } });
}

export function couponBatchesOptions(userId: string, academyId: string, yearId: string | null, prefix: string | null, search: string, page: number) {
  return queryOptions({ queryKey: [...couponRootKey(userId, academyId), "batches", yearId, prefix, search, page], enabled: !!userId,
    queryFn: async () => {
      const result = unwrapContent(await loadCouponBatches({ academyId, yearId, levelId: null, trackId: null, academyWide: true, prefix, search, page }));
      if (result.userId !== userId) throw new Error("Your account changed. Reload this page.");
      return result;
    } });
}

/** The complete coupon list of one batch; shared by the batch sheet and print preview. */
export function couponBatchOptions(userId: string, academyId: string, batchId: string) {
  return queryOptions({ queryKey: [...couponRootKey(userId, academyId), "batch", batchId], enabled: !!userId && !!batchId,
    queryFn: async () => {
      const result = unwrapContent(await loadCouponBatch({ academyId, batchId }));
      if (result.userId !== userId) throw new Error("Your account changed. Reload this page.");
      return result;
    } });
}
