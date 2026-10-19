import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { muxRequest, type MuxAsset } from "@/lib/video/mux";

/** Provider callbacks only; callers must establish staff authority or verify a provider signature. */
export function mediaAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Video processing is not configured. Ask a manager to check the server credentials.");
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
/** The caller verifies the raw provider signature before invoking this service. */
export async function synchronizeProviderUpload(uploadId: string) {
  const { data, error } = await mediaAdmin().from("content_assets").select("id,provider_upload_id").eq("provider_upload_id", uploadId).is("deletion_token", null).maybeSingle();
  if (error) throw new Error("Could not read video processing status.");
  if (data) await synchronizeVideo(data.id, uploadId);
}
export async function synchronizeVideo(localAssetId: string, uploadId: string) {
  const upload = await muxRequest<{ status: string; asset_id?: string }>(`video/v1/uploads/${encodeURIComponent(uploadId)}`);
  let providerAsset: MuxAsset | null = null;
  if (upload.asset_id) providerAsset = await muxRequest<MuxAsset>(`video/v1/assets/${encodeURIComponent(upload.asset_id)}`);
  const signed = providerAsset?.playback_ids?.find(id => id.policy === "signed");
  const status = providerAsset?.status === "ready" && signed ? "ready"
    : providerAsset?.status === "errored" || ["errored", "cancelled", "timed_out"].includes(upload.status) ? "failed"
    : providerAsset ? "processing" : "uploading";
  const { error } = await mediaAdmin().from("content_assets").update({ status, provider_asset_id: providerAsset?.id ?? null, playback_id: signed?.id ?? null })
    .eq("id", localAssetId).eq("provider_upload_id", uploadId).neq("status", "ready").is("deletion_token", null);
  if (error) throw new Error("Could not save video processing status.");
  return status;
}
