"use server";

import { z } from "zod";
import { contentCaller, contentResult } from "../data";
import { learningError } from "../access/types";
import { couponBatchSchema, couponOptionsSchema, couponPageSchema, prefixSchema } from "./types";

const academyInput = z.object({ academyId: z.guid() });
const requestInput = academyInput.extend({ requestId: z.guid() });
const scopeInput = z.object({ yearId: z.guid(), levelId: z.string().min(1), trackId: z.guid().nullable() });

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
    const input = academyInput.merge(scopeInput).extend({ typeId: z.guid().nullable(), status: z.enum(["all", "unused", "redeemed", "revoked"]), search: z.string().max(100), page: z.number().int().min(0).max(4000) }).parse(value);
    const { db, userId } = await contentCaller(input.academyId);
    const { data, error } = await db.rpc("get_scoped_content_coupons", { p_academy_id: input.academyId, p_year_id: input.yearId, p_level_id: input.levelId, p_track_id: input.trackId!, p_type_id: input.typeId ?? undefined, p_status: input.status, p_search: input.search, p_offset: input.page * 25 });
    learningError(error);
    return { ...couponPageSchema.parse(data), userId };
  });
}

export async function createCouponType(value: unknown) {
  return contentResult(async () => {
    const input = requestInput.merge(scopeInput).extend({ name: z.string().trim().min(1).max(80), prefix: prefixSchema, allTracks: z.boolean() }).parse(value);
    const { db } = await contentCaller(input.academyId);
    const { data, error } = await db.rpc("create_scoped_coupon_type", { p_academy_id: input.academyId, p_year_id: input.yearId, p_level_id: input.levelId, p_track_id: input.trackId!, p_name: input.name, p_request_id: input.requestId, p_prefix: input.prefix, p_all_tracks: input.allTracks });
    learningError(error);
    return z.object({ id: z.guid() }).parse(data);
  });
}

export async function changeCouponPrefix(value: unknown) {
  return contentResult(async () => {
    const input = requestInput.merge(scopeInput).extend({ typeId: z.guid().nullable(), prefix: prefixSchema }).parse(value);
    const { db } = await contentCaller(input.academyId);
    const { error } = input.typeId ? await db.rpc("change_content_coupon_prefix", { p_academy_id: input.academyId, p_type_id: input.typeId, p_prefix: input.prefix, p_request_id: input.requestId }) : await db.rpc("change_default_coupon_prefix", { p_academy_id: input.academyId, p_year_id: input.yearId, p_level_id: input.levelId, p_track_id: input.trackId!, p_prefix: input.prefix, p_request_id: input.requestId });
    learningError(error);
  });
}

export async function generateCoupons(value: unknown) {
  return contentResult(async () => {
    const input = requestInput.merge(scopeInput).extend({ typeId: z.guid().nullable(), quantity: z.number().int().min(1).max(1000) }).parse(value);
    const { db } = await contentCaller(input.academyId);
    const { data, error } = input.typeId ? await db.rpc("generate_content_coupons", { p_academy_id: input.academyId, p_type_id: input.typeId, p_quantity: input.quantity, p_request_id: input.requestId }) : await db.rpc("generate_default_coupons", { p_academy_id: input.academyId, p_year_id: input.yearId, p_level_id: input.levelId, p_track_id: input.trackId!, p_quantity: input.quantity, p_request_id: input.requestId });
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
