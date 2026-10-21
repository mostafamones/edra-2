import "server-only";
import { createPrivateKey, createSign, createHmac, timingSafeEqual } from "node:crypto";

type MuxResponse<T> = { data: T };
export class MuxRequestError extends Error {
  constructor(readonly status: number) { super("The video provider is unavailable. Please retry."); }
}
export async function muxRequest<T>(path: string, body?: object, method = body ? "POST" : "GET"): Promise<T> {
  const id = process.env.MUX_TOKEN_ID, secret = process.env.MUX_TOKEN_SECRET;
  if (!id || !secret) throw new Error("Video uploads are not configured. Ask a manager to check Mux setup.");
  const response = await fetch(`https://api.mux.com/${path}`, {
    method, cache: "no-store", signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new MuxRequestError(response.status);
  if (response.status === 204) return undefined as T;
  return ((await response.json()) as MuxResponse<T>).data;
}
export type MuxUpload = { id: string; url: string; status: string; asset_id?: string };
export type MuxAsset = { id: string; status: string; playback_ids?: { id: string; policy: string }[] };
export async function deleteVideo(assetId: string | null, uploadId: string | null) {
  // A waiting direct upload must be cancelled before a late PUT can create an asset.
  // If processing won the race, reread it and delete the resulting asset instead.
  let discovered: string | undefined;
  if (uploadId) {
    const path = `video/v1/uploads/${encodeURIComponent(uploadId)}`;
    let upload: MuxUpload | null = null;
    try { upload = await muxRequest<MuxUpload>(path); }
    catch (e) { if (!(e instanceof MuxRequestError && e.status === 404)) throw e; }
    if (upload?.status === "waiting") {
      try { upload = await muxRequest<MuxUpload>(`${path}/cancel`, undefined, "PUT"); }
      catch (e) {
        if (!(e instanceof MuxRequestError && [400, 409].includes(e.status))) throw e;
        upload = await muxRequest<MuxUpload>(path);
      }
    }
    if (upload && (!["cancelled", "errored", "timed_out", "asset_created"].includes(upload.status) || (upload.status === "asset_created" && !upload.asset_id))) throw new Error("The upload is still settling. Retry deletion shortly.");
    discovered = upload?.asset_id;
  }
  for (const id of new Set([assetId, discovered].filter((id): id is string => !!id))) {
    try { await muxRequest<void>(`video/v1/assets/${encodeURIComponent(id)}`, undefined, "DELETE"); }
    catch (e) { if (!(e instanceof MuxRequestError && e.status === 404)) throw e; }
  }
}
export function createVideoUpload(assetId: string, origin: string) {
  return muxRequest<MuxUpload>("video/v1/uploads", { cors_origin: origin, timeout: 3600, new_asset_settings: { playback_policies: ["signed"], video_quality: "basic", passthrough: assetId } });
}
export function playbackToken(playbackId: string, audience: "v" | "t" | "s" = "v", expiresBefore?: number) {
  const keyId = process.env.MUX_SIGNING_KEY_ID, privateKey = process.env.MUX_SIGNING_PRIVATE_KEY;
  if (!keyId || !privateKey) throw new Error("Protected video playback is not configured.");
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const expires = Math.min(now + 15 * 60, expiresBefore ?? Infinity);
  if (!Number.isFinite(expires) || expires <= now) throw new Error("Playback access has expired.");
  const payload = `${encode({ alg: "RS256", typ: "JWT", kid: keyId })}.${encode({ sub: playbackId, aud: audience, exp: expires, kid: keyId })}`;
  const key = createPrivateKey(Buffer.from(privateKey, "base64").toString("utf8"));
  return { token: `${payload}.${createSign("RSA-SHA256").update(payload).sign(key, "base64url")}`, expires };
}
export function validMuxWebhook(body: string, signature: string | null, secret: string, now = Date.now()) {
  if (!signature || !secret) return false;
  const entries = signature.split(",").map(part => part.trim().split("="));
  const timestamp = entries.find(([key]) => key === "t")?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
  return entries.filter(([key]) => key === "v1").some(([, value]) => {
    if (!value || !/^[0-9a-f]{64}$/i.test(value)) return false;
    return timingSafeEqual(expected, Buffer.from(value, "hex"));
  });
}
