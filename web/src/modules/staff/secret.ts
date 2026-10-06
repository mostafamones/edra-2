import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { platformOrigin, staffInviteHref } from "../../lib/routing";

// Server-only. Invitation tokens are generated here, stored by the database only as a SHA-256 digest
// plus this AES-256-GCM ciphertext, and decrypted only for managers allowed to copy a pending link.

const VERSION = "v1";

function linkKey() {
  const key = Buffer.from(process.env.STAFF_INVITE_LINK_KEY ?? "", "base64");
  if (key.length !== 32) throw new Error("STAFF_INVITE_LINK_KEY must be 32 bytes encoded as base64.");
  return key;
}

/** The public Edra origin used in shared links. Never derived from a request Host header. */
export function appOrigin() {
  return platformOrigin("staff");
}

export function staffInviteLink(token: string) {
  return staffInviteHref(token);
}

export function generateInviteToken() {
  return randomBytes(32).toString("base64url");
}

/** Binds the ciphertext to its academy so it cannot be replayed into another academy's row. */
export function encryptInviteToken(token: string, academyId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", linkKey(), iv);
  cipher.setAAD(Buffer.from(academyId));
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), body.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

export function decryptInviteToken(ciphertext: string, academyId: string) {
  const [version, iv, body, tag] = ciphertext.split(".");
  if (version !== VERSION || !iv || !body || !tag) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", linkKey(), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(academyId));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
