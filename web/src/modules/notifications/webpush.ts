/**
 * Standards Web Push on WebCrypto only, so it runs unchanged in the Cloudflare Worker:
 * RFC 8291 message encryption (aes128gcm, RFC 8188) and RFC 8292 VAPID authorization.
 * No dependency: the Node `web-push` package needs node:crypto ECDH APIs the Worker lacks.
 */
const text = new TextEncoder();

export function base64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromBase64url(value: string) {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error("Invalid base64url");
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
const concat = (...parts: ArrayLike<number>[]) => {
  const out = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};
async function hmac(key: Uint8Array, data: Uint8Array) {
  const imported = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, data as BufferSource));
}

/** Browsers' push services. Anything else is refused, so a stored endpoint cannot aim the Worker elsewhere. */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];
export function pushEndpointAllowed(endpoint: string) {
  if (endpoint.length > 2048 || /[\s#]/.test(endpoint)) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch { return false; }
}
export type PushKeys = { p256dh: string; auth: string };
export function pushKeysValid({ p256dh, auth }: PushKeys) {
  try {
    const key = fromBase64url(p256dh);
    return /^B[A-Za-z0-9_-]{86}$/.test(p256dh) && key.length === 65 && key[0] === 4
      && /^[A-Za-z0-9_-]{22}$/.test(auth) && fromBase64url(auth).length === 16;
  } catch { return false; }
}

/** Plaintext limit: one 4096-octet record with the 86-octet header stays within push-service limits. */
export const PUSH_PLAINTEXT_MAX = 3000;

/** RFC 8291 §3/§4: one aes128gcm record. `salt`/`sender` are injectable only for the RFC test vector. */
export async function encryptPushPayload(plaintext: Uint8Array, keys: PushKeys, fixed?: { salt: Uint8Array; sender: CryptoKeyPair }) {
  if (!pushKeysValid(keys)) throw new Error("Invalid subscription keys");
  if (plaintext.length > PUSH_PLAINTEXT_MAX) throw new Error("Push payload too large");
  const uaPublic = fromBase64url(keys.p256dh);
  const authSecret = fromBase64url(keys.auth);
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const sender = fixed?.sender ?? await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", sender.publicKey) as ArrayBuffer);
  const receiver = await crypto.subtle.importKey("raw", uaPublic as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: receiver }, sender.privateKey, 256));
  const ikm = await hmac(await hmac(authSecret, shared), concat(text.encode("WebPush: info\0"), uaPublic, asPublic, [1]));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(text.encode("Content-Encoding: aes128gcm\0"), [1]))).slice(0, 16);
  const nonce = (await hmac(prk, concat(text.encode("Content-Encoding: nonce\0"), [1]))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // A single final record: plaintext, then the 0x02 delimiter, no padding.
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(plaintext, [2])));
  const header = new Uint8Array(86);
  header.set(salt); new DataView(header.buffer).setUint32(16, 4096); header[20] = 65; header.set(asPublic, 21);
  return concat(header, cipher);
}

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };
export function vapidValid(config: VapidConfig) {
  try {
    const pub = fromBase64url(config.publicKey);
    return pub.length === 65 && pub[0] === 4 && fromBase64url(config.privateKey).length === 32 && /^(mailto:|https:\/\/)\S+$/.test(config.subject);
  } catch { return false; }
}

/** RFC 8292: an ES256 JWT for the push service's origin, valid for 12 hours (limit 24). */
export async function vapidAuthorization(endpoint: string, config: VapidConfig, now = Date.now()) {
  const pub = fromBase64url(config.publicKey);
  const key = await crypto.subtle.importKey("jwk", {
    kty: "EC", crv: "P-256", x: base64url(pub.slice(1, 33)), y: base64url(pub.slice(33, 65)), d: config.privateKey, ext: true,
  }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const encode = (value: object) => base64url(text.encode(JSON.stringify(value)));
  const unsigned = `${encode({ typ: "JWT", alg: "ES256" })}.${encode({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: config.subject })}`;
  // WebCrypto returns the raw r||s signature JWS ES256 expects.
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, text.encode(unsigned)));
  return `vapid t=${unsigned}.${base64url(signature)}, k=${config.publicKey}`;
}

export type PushOutcome = { outcome: "sent" | "gone" | "retry" | "failed"; status: number | null; retryAfter: number | null };

function retryAfter(value: string | null, now: number) {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - now) / 1000));
}

/**
 * Sends one encrypted message. Never follows redirects; 404/410 mean the subscription is gone;
 * 429/5xx/network failures are retried; other refusals fail without retry.
 */
export async function sendWebPush(endpoint: string, keys: PushKeys, payload: string, config: VapidConfig,
  options: { ttl: number; urgency: "normal" | "high" }, send: typeof fetch = fetch): Promise<PushOutcome> {
  if (!pushEndpointAllowed(endpoint)) return { outcome: "failed", status: null, retryAfter: null };
  const body = await encryptPushPayload(text.encode(payload), keys);
  try {
    const response = await send(endpoint, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(10_000), body,
      headers: { Authorization: await vapidAuthorization(endpoint, config), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(options.ttl), Urgency: options.urgency },
    });
    const status = response.status;
    await response.body?.cancel().catch(() => undefined);
    if (status >= 200 && status < 300) return { outcome: "sent", status, retryAfter: null };
    if (status === 404 || status === 410) return { outcome: "gone", status, retryAfter: null };
    if (status === 429 || status >= 500) return { outcome: "retry", status, retryAfter: retryAfter(response.headers.get("retry-after"), Date.now()) };
    return { outcome: "failed", status, retryAfter: null };
  } catch {
    return { outcome: "retry", status: null, retryAfter: null };
  }
}
