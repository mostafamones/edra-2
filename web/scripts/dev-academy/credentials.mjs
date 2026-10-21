// Credential helpers for dev-academy: AES-256-GCM sealing bound to a context, and random passwords.
// Errors never echo inputs, so plaintext or key material cannot leak through logs.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PREFIX = "v1";

/** Reads the 32-byte key from the environment; accepts base64 or base64url. */
export function loadKey(env = process.env) {
  const raw = env.EDRA_DEV_ACADEMY_ENCRYPTION_KEY;
  const key = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (key.length !== KEY_BYTES) {
    throw new Error("EDRA_DEV_ACADEMY_ENCRYPTION_KEY must be a base64 32-byte key.");
  }
  return key;
}

/** Password from CSPRNG bytes, never from the scenario seed. */
export function randomPassword() {
  return randomBytes(24).toString("base64url");
}

function aad({ purpose, projectRef, runId, userId }) {
  const parts = { purpose, projectRef, runId, userId };
  for (const [name, value] of Object.entries(parts)) {
    if (typeof value !== "string" || value === "" || value.includes(":")) {
      throw new Error(`Invalid credential context: ${name}.`);
    }
  }
  return Buffer.from(`edra-dev:${PREFIX}:${purpose}:${projectRef}:${runId}:${userId}`, "utf8");
}

/** Seals plaintext as `v1.<iv>.<ciphertext>.<tag>` (base64url parts), bound to the context via AAD. */
export function encryptSecret(key, plaintext, context) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
}

/** Opens a token from encryptSecret; any failure throws the same generic error. */
export function decryptSecret(key, token, context) {
  try {
    const parts = String(token).split(".");
    if (parts.length !== 4 || parts[0] !== PREFIX) throw new Error("format");
    const [iv, ciphertext, tag] = parts.slice(1).map((part) => Buffer.from(part, "base64url"));
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error("format");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aad(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Credential could not be decrypted.");
  }
}
