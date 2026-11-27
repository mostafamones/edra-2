import "@tanstack/react-start/server-only";
import { z } from "zod";
import { contentCaller, contentError, contentResult } from "./data";
import { maxYoutubeDuration, youtubeIdFromUrl } from "./youtube";

export async function registerYoutube(value: unknown) {
  return contentResult(async () => {
    const input = z.object({ academyId: z.guid(), unitId: z.guid(), assetId: z.guid(), title: z.string().trim().min(1).max(250), url: z.string().max(2048), duration: z.number().positive().max(maxYoutubeDuration).optional() }).parse(value);
    const id = youtubeIdFromUrl(input.url);
    if (!id) throw new Error("Enter a YouTube video link.");
    const { db } = await contentCaller(input.academyId);
    const { duration } = input;
    const { error } = await db.rpc("register_youtube_lesson", { p_academy_id: input.academyId, p_unit_id: input.unitId,
      p_asset_id: input.assetId, p_title: input.title, p_youtube_id: id, ...(duration === undefined ? {} : { p_duration: duration }) });
    contentError(error);
    return input.assetId;
  });
}
