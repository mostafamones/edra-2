import { describe, expect, it, vi } from "vitest";

import { base64url, encryptPushPayload, fromBase64url, pushEndpointAllowed, pushKeysValid, sendWebPush, vapidAuthorization, vapidValid } from "./webpush";

// RFC 8291 Appendix A / §5 test vector.
const RFC = {
  plaintext: "V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" + "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT"
    + "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};
const jwk = (publicKey: string, d?: string) => {
  const raw = fromBase64url(publicKey);
  return { kty: "EC", crv: "P-256", x: base64url(raw.slice(1, 33)), y: base64url(raw.slice(33, 65)), ...(d && { d }), ext: true };
};
async function pair(publicKey: string, d: string, name: "ECDH" | "ECDSA") {
  const usage: KeyUsage[] = name === "ECDH" ? ["deriveBits"] : ["sign"];
  return {
    privateKey: await crypto.subtle.importKey("jwk", jwk(publicKey, d), { name, namedCurve: "P-256" }, true, usage),
    publicKey: await crypto.subtle.importKey("jwk", jwk(publicKey), { name, namedCurve: "P-256" }, true, name === "ECDH" ? [] : ["verify"]),
  } as CryptoKeyPair;
}

/** The user agent's side of RFC 8291, to prove what the receiver can read. */
async function decrypt(body: Uint8Array, uaPublic: string, uaPrivate: string, auth: string) {
  const hmac = async (key: Uint8Array, data: Uint8Array) => new Uint8Array(await crypto.subtle.sign("HMAC",
    await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), data as BufferSource));
  const salt = body.slice(0, 16); const asPublic = body.slice(21, 86);
  expect(new DataView(body.buffer, body.byteOffset).getUint32(16)).toBe(4096);
  expect(body[20]).toBe(65);
  const ua = await pair(uaPublic, uaPrivate, "ECDH");
  const sender = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: sender }, ua.privateKey, 256));
  const enc = new TextEncoder();
  const info = new Uint8Array([...enc.encode("WebPush: info\0"), ...fromBase64url(uaPublic), ...asPublic, 1]);
  const prk = await hmac(salt, await hmac(await hmac(fromBase64url(auth), shared), info));
  const cek = (await hmac(prk, new Uint8Array([...enc.encode("Content-Encoding: aes128gcm\0"), 1]))).slice(0, 16);
  const nonce = (await hmac(prk, new Uint8Array([...enc.encode("Content-Encoding: nonce\0"), 1]))).slice(0, 12);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]), body.slice(86)));
  expect(plain[plain.length - 1]).toBe(2);
  return new TextDecoder().decode(plain.slice(0, -1));
}

describe("RFC 8291 encryption", () => {
  it("reproduces the RFC test vector exactly", async () => {
    const body = await encryptPushPayload(fromBase64url(RFC.plaintext), { p256dh: RFC.uaPublic, auth: RFC.auth },
      { salt: fromBase64url(RFC.salt), sender: await pair(RFC.asPublic, RFC.asPrivate, "ECDH") });
    expect(base64url(body)).toBe(RFC.body);
  });

  it("produces fresh ciphertext the receiver can decrypt", async () => {
    const keys = { p256dh: RFC.uaPublic, auth: RFC.auth };
    const a = await encryptPushPayload(new TextEncoder().encode('{"x":1}'), keys);
    const b = await encryptPushPayload(new TextEncoder().encode('{"x":1}'), keys);
    expect(base64url(a)).not.toBe(base64url(b));
    expect(await decrypt(a, RFC.uaPublic, RFC.uaPrivate, RFC.auth)).toBe('{"x":1}');
  });

  it("refuses malformed keys and oversized payloads", async () => {
    expect(pushKeysValid({ p256dh: RFC.uaPublic, auth: RFC.auth })).toBe(true);
    expect(pushKeysValid({ p256dh: RFC.uaPublic.slice(1), auth: RFC.auth })).toBe(false);
    expect(pushKeysValid({ p256dh: RFC.uaPublic, auth: `${RFC.auth}A` })).toBe(false);
    expect(pushKeysValid({ p256dh: RFC.uaPublic, auth: "BTBZMqHH6r4Tts7J+aSIgg" })).toBe(false);
    await expect(encryptPushPayload(new Uint8Array(3001), { p256dh: RFC.uaPublic, auth: RFC.auth })).rejects.toThrow("too large");
  });
});

describe("endpoint allowlist", () => {
  it("accepts browser push services only", () => {
    for (const ok of ["https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QH4", "https://wns2-bl2p.notify.windows.com/w/?token=x"]) expect(pushEndpointAllowed(ok)).toBe(true);
    for (const bad of ["http://fcm.googleapis.com/fcm/send/a", "https://fcm.googleapis.com:8443/a", "https://user@fcm.googleapis.com/a",
      "https://fcm.googleapis.com.evil.test/a", "https://169.254.169.254/latest", "https://localhost/a", "https://evil.test/push.apple.com",
      "https://notify.windows.com.evil.test/a", "not a url", "https://fcm.googleapis.com/a#frag"]) expect(pushEndpointAllowed(bad)).toBe(false);
  });
});

// Ephemeral test-only VAPID keys, generated per run.
async function testVapid() {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey) as ArrayBuffer);
  const { d } = await crypto.subtle.exportKey("jwk", keys.privateKey);
  return { keys, config: { publicKey: base64url(raw), privateKey: d!, subject: "mailto:push@edra.test" } };
}

describe("VAPID", () => {
  it("signs an ES256 JWT for the push service origin that verifies with the public key", async () => {
    const { keys, config } = await testVapid();
    expect(vapidValid(config)).toBe(true);
    expect(vapidValid({ ...config, subject: "push@edra.test" })).toBe(false);
    const header = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", config, 1_700_000_000_000);
    const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(k).toBe(config.publicKey);
    const [h, c, s] = token.split(".");
    expect(JSON.parse(new TextDecoder().decode(fromBase64url(h)))).toEqual({ typ: "JWT", alg: "ES256" });
    expect(JSON.parse(new TextDecoder().decode(fromBase64url(c)))).toEqual({ aud: "https://fcm.googleapis.com", exp: 1_700_000_000 + 43200, sub: "mailto:push@edra.test" });
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, keys.publicKey, fromBase64url(s) as BufferSource, new TextEncoder().encode(`${h}.${c}`))).toBe(true);
  });
});

describe("sendWebPush", () => {
  const keys = { p256dh: RFC.uaPublic, auth: RFC.auth };
  const endpoint = "https://fcm.googleapis.com/fcm/send/abc";

  it("posts one encrypted, VAPID-authorized request without following redirects", async () => {
    const { config } = await testVapid();
    const send = vi.fn(async () => new Response(null, { status: 201 }));
    expect(await sendWebPush(endpoint, keys, '{"title":"Hi"}', config, { ttl: 3600, urgency: "high" }, send as unknown as typeof fetch))
      .toEqual({ outcome: "sent", status: 201, retryAfter: null });
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe(endpoint);
    expect(init.redirect).toBe("manual");
    expect(init.headers).toMatchObject({ "Content-Encoding": "aes128gcm", TTL: "3600", Urgency: "high" });
    expect(init.headers.Authorization).toMatch(/^vapid t=.+, k=/);
    expect(await decrypt(init.body as Uint8Array, RFC.uaPublic, RFC.uaPrivate, RFC.auth)).toBe('{"title":"Hi"}');
  });

  it("classifies push-service responses", async () => {
    const { config } = await testVapid();
    const outcome = (response: Response | Error) => sendWebPush(endpoint, keys, "{}", config, { ttl: 60, urgency: "normal" },
      (async () => { if (response instanceof Error) throw response; return response; }) as unknown as typeof fetch);
    expect((await outcome(new Response(null, { status: 410 }))).outcome).toBe("gone");
    expect((await outcome(new Response(null, { status: 404 }))).outcome).toBe("gone");
    expect(await outcome(new Response(null, { status: 429, headers: { "Retry-After": "120" } }))).toEqual({ outcome: "retry", status: 429, retryAfter: 120 });
    expect((await outcome(new Response(null, { status: 503 }))).outcome).toBe("retry");
    expect((await outcome(new Response(null, { status: 301, headers: { Location: "https://evil.test" } }))).outcome).toBe("failed");
    expect((await outcome(new Response(null, { status: 403 }))).outcome).toBe("failed");
    expect(await outcome(new TypeError("network"))).toEqual({ outcome: "retry", status: null, retryAfter: null });
  });

  it("never contacts a host outside the allowlist", async () => {
    const { config } = await testVapid();
    const send = vi.fn();
    expect((await sendWebPush("https://evil.test/x", keys, "{}", config, { ttl: 60, urgency: "normal" }, send as unknown as typeof fetch)).outcome).toBe("failed");
    expect(send).not.toHaveBeenCalled();
  });
});
