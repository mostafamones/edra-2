import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { decryptSecret, encryptSecret, loadKey, randomPassword } from "./credentials.mjs";

const key = randomBytes(32);
const context = { purpose: "account", projectRef: "fgbcjlibwgxylfwmocgx", runId: "run-1", userId: "user-1" };
const plaintext = "super-secret-password-value";

/** Replaces one segment of a sealed token, keeping the rest intact. */
function withPart(token, index, value) {
  const parts = token.split(".");
  parts[index] = value;
  return parts.join(".");
}

function flipFirstByte(b64url) {
  const buf = Buffer.from(b64url, "base64url");
  buf[0] ^= 0x01;
  return buf.toString("base64url");
}

describe("encryptSecret and decryptSecret", () => {
  it("round trips the plaintext", () => {
    const token = encryptSecret(key, plaintext, context);
    assert.equal(decryptSecret(key, token, context), plaintext);
  });

  it("fails when any context field changes", () => {
    const token = encryptSecret(key, plaintext, context);
    for (const field of Object.keys(context)) {
      const changed = { ...context, [field]: `${context[field]}x` };
      assert.throws(() => decryptSecret(key, token, changed), { message: "Credential could not be decrypted." }, field);
    }
  });

  it("fails when the ciphertext, tag or iv is tampered with", () => {
    const token = encryptSecret(key, plaintext, context);
    const [, iv, ciphertext, tag] = token.split(".");
    const tampered = [withPart(token, 2, flipFirstByte(ciphertext)), withPart(token, 3, flipFirstByte(tag)), withPart(token, 1, flipFirstByte(iv))];
    for (const bad of tampered) {
      assert.throws(() => decryptSecret(key, bad, context), { message: "Credential could not be decrypted." });
    }
  });

  it("fails with a wrong key", () => {
    const token = encryptSecret(key, plaintext, context);
    assert.throws(() => decryptSecret(randomBytes(32), token, context), { message: "Credential could not be decrypted." });
  });

  it("fails on malformed tokens", () => {
    const token = encryptSecret(key, plaintext, context);
    assert.throws(() => decryptSecret(key, token.slice(0, -3), context), { message: "Credential could not be decrypted." });
    assert.throws(() => decryptSecret(key, withPart(token, 0, "v2"), context), { message: "Credential could not be decrypted." });
    assert.throws(() => decryptSecret(key, `${token}.extra`, context), { message: "Credential could not be decrypted." });
  });

  it("produces different tokens for the same plaintext", () => {
    assert.notEqual(encryptSecret(key, plaintext, context), encryptSecret(key, plaintext, context));
  });

  it("never includes the plaintext in error messages", () => {
    const token = encryptSecret(key, plaintext, context);
    try {
      decryptSecret(randomBytes(32), token, context);
      assert.fail("expected decryption to fail");
    } catch (error) {
      assert.ok(!error.message.includes(plaintext));
      assert.ok(!error.message.includes(token));
    }
  });

  it("rejects contexts containing ':' or empty parts", () => {
    assert.throws(() => encryptSecret(key, plaintext, { ...context, runId: "a:b" }));
    assert.throws(() => encryptSecret(key, plaintext, { ...context, userId: "" }));
  });
});

describe("loadKey", () => {
  const raw = randomBytes(32);

  it("accepts base64 and base64url 32-byte keys", () => {
    assert.deepEqual(loadKey({ EDRA_DEV_ACADEMY_ENCRYPTION_KEY: raw.toString("base64") }), raw);
    assert.deepEqual(loadKey({ EDRA_DEV_ACADEMY_ENCRYPTION_KEY: raw.toString("base64url") }), raw);
  });

  it("rejects missing and short keys", () => {
    const message = "EDRA_DEV_ACADEMY_ENCRYPTION_KEY must be a base64 32-byte key.";
    assert.throws(() => loadKey({}), { message });
    assert.throws(() => loadKey({ EDRA_DEV_ACADEMY_ENCRYPTION_KEY: "" }), { message });
    assert.throws(() => loadKey({ EDRA_DEV_ACADEMY_ENCRYPTION_KEY: randomBytes(16).toString("base64") }), { message });
  });
});

describe("randomPassword", () => {
  it("is 32 base64url characters and differs between calls", () => {
    const first = randomPassword();
    assert.match(first, /^[A-Za-z0-9_-]{32}$/);
    assert.notEqual(first, randomPassword());
  });
});
