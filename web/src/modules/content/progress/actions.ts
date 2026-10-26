"use server";
import { z } from "zod";
import { contentResult } from "../data";
import { learningCaller } from "../access/data";
import { learningError } from "../access/types";
import { mediaAdmin } from "../media";
import { muxRequest, type MuxAsset } from "@/lib/video/mux";
import { checkpointSchema, progressSessionSchema, savedProgressSchema, startProgressInput } from "./types";

export async function startVideoProgress(value: unknown) {
  return contentResult(async () => {
    const input = startProgressInput.parse(value);
    const { db } = await learningCaller();
    const response = await db.rpc("start_my_content_progress", { p_academy_id: input.academyId, p_unit_id: input.unitId, p_item_id: input.itemId });
    learningError(response.error);
    const session = z.object({ sessionId: z.guid(), assetId: z.guid(), providerAssetId: z.string().nullable(), durationSeconds: z.number().positive().nullable(), positionSeconds: z.number().nonnegative() }).parse(response.data);
    // Backfill older videos only after the database authorized this exact published item.
    if (session.durationSeconds === null) {
      if (!session.providerAssetId) throw new Error("Playback progress is unavailable for this video.");
      const asset = await muxRequest<MuxAsset>(`video/v1/assets/${encodeURIComponent(session.providerAssetId)}`);
      const duration = z.number().finite().positive().max(43200).parse(asset.duration);
      const { error } = await mediaAdmin().from("content_assets").update({ duration_seconds: duration })
        .eq("id", session.assetId).eq("provider_asset_id", session.providerAssetId).is("duration_seconds", null);
      if (error) throw new Error("Could not prepare playback progress. Please retry.");
      session.durationSeconds = duration;
    }
    return progressSessionSchema.parse(session);
  });
}

export async function saveVideoProgress(value: unknown) {
  return contentResult(async () => {
    const input = checkpointSchema.parse(value);
    const { db } = await learningCaller();
    const { data, error } = await db.rpc("save_my_content_progress", { p_academy_id: input.academyId, p_unit_id: input.unitId,
      p_session_id: input.sessionId, p_sequence: input.sequence, p_position: input.position, p_ranges: input.ranges });
    learningError(error);
    return savedProgressSchema.parse(data);
  });
}
