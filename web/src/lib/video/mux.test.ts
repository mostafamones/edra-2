import { createHmac, generateKeyPairSync, verify } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { deleteVideo, playbackToken, validMuxWebhook } from "./mux";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("permanent video deletion", () => {
  function provider(responses: Response[]) {
    vi.stubEnv("MUX_TOKEN_ID", "test-token"); vi.stubEnv("MUX_TOKEN_SECRET", "test-secret");
    const fetcher = vi.fn(async () => { const next = responses.shift(); if (!next) throw new Error("Unexpected provider call"); return next; });
    vi.stubGlobal("fetch", fetcher); return fetcher;
  }
  const upload = (data: object) => new Response(JSON.stringify({ data }), { status: 200 });
  it("deletes the provider asset and accepts an empty 204 response", async () => {
    const fetcher = provider([upload({ status: "asset_created", asset_id: "asset" }), new Response(null, { status: 204 })]);
    await deleteVideo("asset", "upload");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]).toMatchObject(["https://api.mux.com/video/v1/assets/asset", { method: "DELETE" }]);
  });
  it("cancels a waiting upload so a late PUT cannot create a video", async () => {
    const fetcher = provider([upload({ status: "waiting" }), upload({ status: "cancelled" })]);
    await deleteVideo(null, "upload");
    expect(fetcher.mock.calls[1]).toMatchObject(["https://api.mux.com/video/v1/uploads/upload/cancel", { method: "PUT" }]);
  });
  it("deletes an asset created while cancellation was racing", async () => {
    const fetcher = provider([upload({ status: "waiting" }), new Response(null, { status: 409 }), upload({ status: "asset_created", asset_id: "racing-asset" }), new Response(null, { status: 204 })]);
    await deleteVideo(null, "upload");
    expect(fetcher.mock.calls[3]).toMatchObject(["https://api.mux.com/video/v1/assets/racing-asset", { method: "DELETE" }]);
  });
  it("can retry after provider deletion already succeeded", async () => {
    provider([new Response(null, { status: 404 }), new Response(null, { status: 404 })]);
    await expect(deleteVideo("already-deleted", "missing-upload")).resolves.toBeUndefined();
  });
  it("fails rather than claiming deletion when cancellation or provider state is unresolved", async () => {
    provider([upload({ status: "waiting" }), new Response(null, { status: 503 })]);
    await expect(deleteVideo(null, "upload")).rejects.toThrow("provider is unavailable");
    provider([upload({ status: "unknown-future-state" })]);
    await expect(deleteVideo(null, "upload")).rejects.toThrow("still settling");
  });
});

it("signs an expiring playback permission for one video and audience", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  vi.stubEnv("MUX_SIGNING_KEY_ID", "development-signing-key");
  vi.stubEnv("MUX_SIGNING_PRIVATE_KEY", Buffer.from(privateKey.export({ format: "pem", type: "pkcs8" })).toString("base64"));
  for (const audience of ["v", "t", "s"] as const) {
    const before = Math.floor(Date.now() / 1000);
    const { token, expires } = playbackToken("only-this-video", audience);
    const [header, payload, signature] = token.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(claims).toMatchObject({ sub: "only-this-video", aud: audience, kid: "development-signing-key", exp: expires });
    expect(expires).toBeGreaterThanOrEqual(before + 899);
    expect(expires).toBeLessThanOrEqual(before + 901);
    expect(verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url"))).toBe(true);
    expect(verify("RSA-SHA256", Buffer.from(`${header}.${payload}changed`), publicKey, Buffer.from(signature, "base64url"))).toBe(false);
  }
});

describe("Mux webhook authentication", () => {
  const now = 1792320000000, timestamp = String(now / 1000), secret = "test-secret", body = '{"type":"video.asset.ready"}';
  const signed = `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
  it("accepts the provider signature over the exact raw body", () => expect(validMuxWebhook(body, signed, secret, now)).toBe(true));
  it("rejects altered bodies, expired events and missing signatures", () => {
    expect(validMuxWebhook(body + " ", signed, secret, now)).toBe(false);
    expect(validMuxWebhook(body, signed, secret, now + 301000)).toBe(false);
    expect(validMuxWebhook(body, null, secret, now)).toBe(false);
    expect(validMuxWebhook(body, `t=${timestamp},v1=abcd`, secret, now)).toBe(false);
  });
});
