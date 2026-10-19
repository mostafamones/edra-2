"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { createVideoUpload, deleteVideo, muxRequest, playbackToken, type MuxUpload } from "@/lib/video/mux";
import { contentCaller, contentError, contentResult } from "./data";
import { mediaAdmin, synchronizeVideo } from "./media";
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from "./types";

const uploadSchema = z.object({ academyId: z.uuid(), unitId: z.uuid(), assetId: z.uuid(), name: z.string().min(1).max(250), mime: z.string().max(150), size: z.number().int().positive().max(2 * 1024 ** 3), kind: z.enum(["video", "document"]) });
export async function beginUpload(value: unknown) {
  return contentResult(async () => {
  const input = uploadSchema.parse(value);
  if (input.kind === "document" && (!DOCUMENT_TYPES.includes(input.mime) || input.size > MAX_DOCUMENT_BYTES)) throw new Error("Choose a supported document up to 25 MB.");
  if (input.kind === "video" && !input.mime.startsWith("video/")) throw new Error("Choose a video file.");
  const { db } = await contentCaller(input.academyId);
  const { error } = await db.rpc("register_content_asset", { p_academy_id: input.academyId, p_unit_id: input.unitId, p_id: input.assetId, p_kind: input.kind, p_name: input.name, p_mime: input.mime }); contentError(error);
  const { data: asset, error: readError } = await db.from("content_assets").select("*").eq("id", input.assetId).eq("academy_id", input.academyId).single(); contentError(readError);
  if (!asset) throw new Error("Upload unavailable.");
  if (asset.deletion_token) throw new Error("This upload is being deleted.");
  if (input.kind === "document") return { assetId: asset.id, path: asset.storage_path!, url: null };
  if (asset.provider_upload_id) {
    const upload = await muxRequest<MuxUpload>(`video/v1/uploads/${encodeURIComponent(asset.provider_upload_id)}`);
    // A lost response after PUT must not upload the same bytes again. Poll the
    // already accepted asset; expired/failed tickets get a fresh authorized URL.
    if (asset.status === "ready" || (upload.status === "asset_created" && asset.status !== "failed")) return { assetId: asset.id, path: null, url: null };
    if (upload.status === "waiting") return { assetId: asset.id, path: null, url: upload.url };
  }
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? process.env.EDRA_APP_ORIGIN;
  if (!origin) throw new Error("The staff app origin is not configured.");
  const upload = await createVideoUpload(asset.id, new URL(origin).origin);
  // Recheck live membership/ownership after the external call; registration is idempotent.
  const recheck = await db.rpc("register_content_asset", { p_academy_id: input.academyId, p_unit_id: input.unitId, p_id: input.assetId, p_kind: input.kind, p_name: input.name, p_mime: input.mime });
  if (recheck.error) { await deleteVideo(null, upload.id); contentError(recheck.error); }
  const admin = mediaAdmin();
  let binding = admin.from("content_assets").update({ provider_upload_id: upload.id, provider_asset_id: null, playback_id: null, status: "uploading" }).eq("id", asset.id).eq("academy_id", input.academyId).neq("status", "ready").is("deletion_token", null);
  binding = asset.provider_upload_id ? binding.eq("provider_upload_id", asset.provider_upload_id) : binding.is("provider_upload_id", null);
  const saved = await binding.select("id"); contentError(saved.error);
  // A parallel retry may have already registered another ticket. Use the bound
  // winner so uploaded bytes always match the provider ID that processing polls.
  if (!saved.data?.length) {
    await deleteVideo(null, upload.id);
    const winner = await db.from("content_assets").select("provider_upload_id").eq("id", asset.id).eq("academy_id", input.academyId).is("deletion_token", null).single(); contentError(winner.error);
    if (!winner.data?.provider_upload_id) throw new Error("Upload unavailable. Retry it.");
    const bound = await muxRequest<MuxUpload>(`video/v1/uploads/${encodeURIComponent(winner.data.provider_upload_id)}`);
    return { assetId: asset.id, path: null, url: bound.status === "asset_created" ? null : bound.url };
  }
  return { assetId: asset.id, path: null, url: upload.url };
  });
}
export async function finishDocument(academyId: string, assetId: string) {
  return contentResult(async () => {
  z.uuid().parse(assetId); const { db } = await contentCaller(academyId);
  const { error } = await db.rpc("complete_content_document", { p_academy_id: academyId, p_asset_id: assetId }); contentError(error);
  });
}
export async function refreshVideo(academyId: string, assetId: string) {
  return contentResult(async () => {
  z.uuid().parse(assetId); const { db } = await contentCaller(academyId);
  const { data, error } = await db.from("content_assets").select("id,provider_upload_id,status,deletion_token").eq("academy_id", academyId).eq("id", assetId).single(); contentError(error);
  if (data?.deletion_token) return "deleting";
  if (!data?.provider_upload_id) return data?.status ?? "uploading";
  if (data.status === "ready" || data.status === "failed") return data.status;
  return synchronizeVideo(data.id, data.provider_upload_id);
  });
}
/** Staff-only preview. Student playback must use annual student/access authority, not this action. */
export async function previewAsset(academyId: string, assetId: string) {
  return contentResult(async () => {
  z.uuid().parse(assetId); const { db } = await contentCaller(academyId);
  const { data, error } = await db.from("content_assets").select("*").eq("academy_id", academyId).eq("id", assetId).single(); contentError(error);
  if (!data || data.status !== "ready" || data.deletion_token) throw new Error("This material is not available for preview.");
  if (data.kind === "video" && data.playback_id) return { kind: "video" as const, playbackId: data.playback_id, ...playbackToken(data.playback_id), thumbnailToken: playbackToken(data.playback_id, "t").token, storyboardToken: playbackToken(data.playback_id, "s").token };
  if (!data.storage_path) throw new Error("Document unavailable.");
  const signed = await db.storage.from("content-documents").createSignedUrl(data.storage_path, 120);
  contentError(signed.error);
  return { kind: "document" as const, url: signed.data!.signedUrl };
  });
}
export async function permanentlyDeleteVideo(academyId: string, assetId: string) {
  return contentResult(async () => {
    z.uuid().parse(assetId);
    const { db } = await contentCaller(academyId);
    const reservation = await db.rpc("request_content_video_deletion", { p_academy_id: academyId, p_asset_id: assetId }); contentError(reservation.error);
    const admin = mediaAdmin();
    const asset = await admin.from("content_assets").select("provider_asset_id,provider_upload_id").eq("academy_id", academyId).eq("id", assetId).eq("deletion_token", reservation.data!).maybeSingle(); contentError(asset.error);
    if (!asset.data) return;
    await deleteVideo(asset.data.provider_asset_id, asset.data.provider_upload_id);
    const completed = await admin.rpc("complete_content_video_deletion", { p_academy_id: academyId, p_asset_id: assetId, p_token: reservation.data! }); contentError(completed.error);
  });
}
