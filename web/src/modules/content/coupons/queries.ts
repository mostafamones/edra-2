"use client";

import { queryOptions } from "@tanstack/react-query";
import { unwrapContent } from "../types";
import { loadCouponBatches, loadCouponOptions } from "./actions";

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
