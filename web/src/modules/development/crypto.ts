import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM sealing shared with scripts/dev-academy/credentials.mjs: `v1.<iv>.<ciphertext>.<tag>`,
 * bound to its purpose, project, run and subject through associated data.
 */
export type SealContext = { purpose: string; projectRef: string; runId: string; subject: string };

function aad({ purpose, projectRef, runId, subject }: SealContext) {
  for (const part of [purpose, projectRef, runId, subject]) {
    if (!part || part.includes(":")) throw new Error("Invalid seal context.");
  }
  return Buffer.from(`edra-dev:v1:${purpose}:${projectRef}:${runId}:${subject}`, "utf8");
}

export function seal(key: Buffer, plaintext: string, context: SealContext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv, ciphertext, cipher.getAuthTag()].map((part) => (typeof part === "string" ? part : part.toString("base64url"))).join(".");
}

/** Opens a sealed value; any failure (tampering, wrong key or context) throws the same error. */
export function open(key: Buffer, token: string, context: SealContext) {
  try {
    const parts = token.split(".");
    if (parts.length !== 4 || parts[0] !== "v1") throw new Error("format");
    const [iv, ciphertext, tag] = parts.slice(1).map((part) => Buffer.from(part, "base64url"));
    if (iv.length !== 12 || tag.length !== 16) throw new Error("format");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aad(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Sealed value could not be opened.");
  }
}

/** A random 256-bit browser control token and the hash stored instead of it. */
export function newControlToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashControlToken(token) };
}

export function hashControlToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
