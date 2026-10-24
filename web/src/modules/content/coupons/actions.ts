"use server";

import { z } from "zod";
import { contentCaller, contentResult } from "../data";
import { learningError } from "../access/types";
import { couponBatchSchema, couponOptionsSchema, couponPageSchema } from "./types";

const academyInput = z.object({ academyId: z.guid() });
const requestInput = academyInput.extend({ requestId: z.guid() });

export async function loadCouponOptions(value: unknown) {
  return contentResult(async () => {
    const { academyId } = academyInput.parse(value);
    const { db, userId } = await contentCaller(academyId);
    const { data, error } = await db.rpc("get_content_coupon_options", { p_academy_id: academyId });
    learningError(error);
    return { ...couponOptionsSchema.parse(data), userId };
  });
}

export async function loadCoupons(value: unknown) {
  return contentResult(async () => {
    const input = academyInput.extend({ programId: z.guid().nullable(), typeId: z.guid().nullable(), status: z.enum(["all", "unused", "redeemed", "revoked"]), search: z.string().max(100), page: z.number().int().min(0).max(4000) }).parse(value);
    const { db, userId } = await contentCaller(input.academyId);
    const { data, error } = await db.rpc("get_content_coupons", { p_academy_id: input.academyId, p_program_id: input.programId ?? undefined, p_type_id: input.typeId ?? undefined, p_status: input.status, p_search: input.search, p_offset: input.page * 25 });
    learningError(error);
    return { ...couponPageSchema.parse(data), userId };
  });
}

export async function createCouponType(value: unknown) {
  return contentResult(async () => {
    const input = requestInput.extend({ programId: z.guid(), name: z.string().trim().min(1).max(80) }).parse(value);
    const { db } = await contentCaller(input.academyId);
    const { data, error } = await db.rpc("create_content_coupon_type", { p_academy_id: input.academyId, p_program_id: input.programId, p_name: input.name, p_request_id: input.requestId });
    learningError(error);
    return z.object({ id: z.guid() }).parse(data);
  });
}

export async function generateCoupons(value: unknown) {
  return contentResult(async () => {
    const input = requestInput.extend({ typeId: z.guid(), quantity: z.number().int().min(1).max(1000) }).parse(value);
    const { db } = await contentCaller(input.academyId);
    const { data, error } = await db.rpc("generate_content_coupons", { p_academy_id: input.academyId, p_type_id: input.typeId, p_quantity: input.quantity, p_request_id: input.requestId });
    learningError(error);
    return couponBatchSchema.parse(data);
  });
}

export async function revokeCoupon(value: unknown) {
  return contentResult(async () => {
    const input = requestInput.extend({ couponId: z.guid() }).parse(value);
    const { db } = await contentCaller(input.academyId);
    const { error } = await db.rpc("revoke_content_coupon", { p_academy_id: input.academyId, p_coupon_id: input.couponId, p_request_id: input.requestId });
    learningError(error);
  });
}
