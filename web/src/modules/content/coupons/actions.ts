import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  loadCouponOptions as loadCouponOptionsServer,
  loadCouponBatches as loadCouponBatchesServer,
  loadCouponBatch as loadCouponBatchServer,
  createCouponType as createCouponTypeServer,
  changeCouponPrefix as changeCouponPrefixServer,
  generateCoupons as generateCouponsServer,
  revokeCoupon as revokeCouponServer,
  renameCouponType as renameCouponTypeServer,
  deleteCouponType as deleteCouponTypeServer,
} from "./actions.server";

const loadCouponOptionsFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => loadCouponOptionsServer(...(data.args as Parameters<typeof loadCouponOptionsServer>)));

export async function loadCouponOptions(...args: Parameters<typeof loadCouponOptionsServer>): Promise<Awaited<ReturnType<typeof loadCouponOptionsServer>>> {
  return loadCouponOptionsFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof loadCouponOptionsServer>>>;
}

const loadCouponBatchesFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => loadCouponBatchesServer(...(data.args as Parameters<typeof loadCouponBatchesServer>)));

export async function loadCouponBatches(...args: Parameters<typeof loadCouponBatchesServer>): Promise<Awaited<ReturnType<typeof loadCouponBatchesServer>>> {
  return loadCouponBatchesFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof loadCouponBatchesServer>>>;
}

const loadCouponBatchFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => loadCouponBatchServer(...(data.args as Parameters<typeof loadCouponBatchServer>)));

export async function loadCouponBatch(...args: Parameters<typeof loadCouponBatchServer>): Promise<Awaited<ReturnType<typeof loadCouponBatchServer>>> {
  return loadCouponBatchFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof loadCouponBatchServer>>>;
}

const createCouponTypeFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => createCouponTypeServer(...(data.args as Parameters<typeof createCouponTypeServer>)));

export async function createCouponType(...args: Parameters<typeof createCouponTypeServer>): Promise<Awaited<ReturnType<typeof createCouponTypeServer>>> {
  return createCouponTypeFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof createCouponTypeServer>>>;
}

const changeCouponPrefixFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => changeCouponPrefixServer(...(data.args as Parameters<typeof changeCouponPrefixServer>)));

export async function changeCouponPrefix(...args: Parameters<typeof changeCouponPrefixServer>): Promise<Awaited<ReturnType<typeof changeCouponPrefixServer>>> {
  return changeCouponPrefixFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof changeCouponPrefixServer>>>;
}

const generateCouponsFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => generateCouponsServer(...(data.args as Parameters<typeof generateCouponsServer>)));

export async function generateCoupons(...args: Parameters<typeof generateCouponsServer>): Promise<Awaited<ReturnType<typeof generateCouponsServer>>> {
  return generateCouponsFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof generateCouponsServer>>>;
}

const revokeCouponFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => revokeCouponServer(...(data.args as Parameters<typeof revokeCouponServer>)));

export async function revokeCoupon(...args: Parameters<typeof revokeCouponServer>): Promise<Awaited<ReturnType<typeof revokeCouponServer>>> {
  return revokeCouponFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof revokeCouponServer>>>;
}

const renameCouponTypeFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => renameCouponTypeServer(...(data.args as Parameters<typeof renameCouponTypeServer>)));

export async function renameCouponType(...args: Parameters<typeof renameCouponTypeServer>): Promise<Awaited<ReturnType<typeof renameCouponTypeServer>>> {
  return renameCouponTypeFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof renameCouponTypeServer>>>;
}

const deleteCouponTypeFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => deleteCouponTypeServer(...(data.args as Parameters<typeof deleteCouponTypeServer>)));

export async function deleteCouponType(...args: Parameters<typeof deleteCouponTypeServer>): Promise<Awaited<ReturnType<typeof deleteCouponTypeServer>>> {
  return deleteCouponTypeFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof deleteCouponTypeServer>>>;
}
