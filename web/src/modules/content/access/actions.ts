"use server";
import { z } from "zod";
import { contentCaller, contentResult } from "../data";
import { mediaAdmin } from "../media";
import { playbackToken } from "@/lib/video/mux";
import { learningCaller, readAccessHistory, readAccessWorkspace, readLearningList, readLearningUnit } from "./data";
import { grantReceiptSchema, learningError, materialSchema, redeemInput, requestInput, staffGrantInput, unitInput } from "./types";

export async function loadAccessWorkspace(value: unknown) { return contentResult(() => readAccessWorkspace(value)); }
export async function loadAccessHistory(value: unknown) { return contentResult(() => readAccessHistory(value)); }
export async function loadLearningList(value: unknown) { return contentResult(() => readLearningList(value)); }
export async function loadLearningUnit(value: unknown) { return contentResult(() => readLearningUnit(value)); }
export async function grantUnitAccess(value: unknown) {
  return contentResult(async () => {
    const input = staffGrantInput.parse(value);
    const { db } = await contentCaller(input.academyId);
    const { data, error } = await db.rpc("confirm_content_access", { p_academy_id: input.academyId, p_unit_id: input.unitId, p_record_id: input.recordId, p_request_id: input.requestId,
      p_expected_grant_id: input.expectedGrantId!, p_expected_revision: input.expectedRevision,
      ...(input.extensionHours === undefined ? {} : { p_extension_hours: input.extensionHours }) });
    learningError(error); return grantReceiptSchema.parse(data);
  });
}
export async function revokeUnitAccess(value: unknown) {
  return contentResult(async () => {
    const input = requestInput.extend({ recordId: z.guid(), grantId: z.guid(), reason: z.string().trim().min(1).max(1000) }).parse(value);
    const { db } = await contentCaller(input.academyId);
    const { error } = await db.rpc("revoke_content_access", { p_academy_id: input.academyId, p_unit_id: input.unitId, p_record_id: input.recordId, p_request_id: input.requestId, p_grant_id: input.grantId, p_reason: input.reason });
    learningError(error);
  });
}
export async function redeemUnitCode(value: unknown) {
  return contentResult(async () => {
    const input = redeemInput.parse(value);
    const { db } = await learningCaller();
    const { data, error } = await db.rpc("redeem_content_coupon", { p_academy_id: input.academyId, p_unit_id: input.unitId, p_code: input.code, p_request_id: input.requestId });
    learningError(error);
    if (data && typeof data === "object" && "error" in data && typeof data.error === "string") learningError({ message: data.error });
    return grantReceiptSchema.parse(data);
  });
}
export async function extendMyUnitAccess(value: unknown) {
  return contentResult(async () => {
    const input = requestInput.parse(value);
    const { db } = await learningCaller();
    const { data, error } = await db.rpc("extend_my_content_access", { p_academy_id: input.academyId, p_unit_id: input.unitId, p_request_id: input.requestId });
    learningError(error); return grantReceiptSchema.parse(data);
  });
}
export async function openLearningMaterial(value: unknown) {
  return contentResult(async () => {
    const input = unitInput.extend({ itemId: z.guid() }).parse(value);
    const { db } = await learningCaller();
    const { data, error } = await db.rpc("authorize_content_material", { p_academy_id: input.academyId, p_unit_id: input.unitId, p_item_id: input.itemId });
    learningError(error);
    const material = materialSchema.parse(data);
    const deadline = Math.floor(new Date(material.expiresAt).getTime() / 1000);
    if (deadline <= Math.floor(Date.now() / 1000)) throw new Error("Your access has expired.");
    if (material.kind === "video" && material.playbackId) {
      const playback = playbackToken(material.playbackId, "v", deadline);
      return { kind: "video" as const, playbackId: material.playbackId, token: playback.token, expires: playback.expires,
        thumbnailToken: playbackToken(material.playbackId, "t", deadline).token, storyboardToken: playbackToken(material.playbackId, "s", deadline).token };
    }
    if (material.kind !== "document" || !material.storagePath) throw new Error("This material is not available.");
    const ttl = Math.min(120, deadline - Math.floor(Date.now() / 1000));
    if (ttl <= 0) throw new Error("Your access has expired.");
    const signed = await mediaAdmin().storage.from("content-documents").createSignedUrl(material.storagePath, ttl);
    if (signed.error || !signed.data) throw new Error("Could not open this document. Please retry.");
    return { kind: "document" as const, url: signed.data.signedUrl, expires: Math.floor(Date.now() / 1000) + ttl };
  });
}
