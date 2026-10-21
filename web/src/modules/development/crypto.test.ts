import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hashControlToken, newControlToken, open, seal, type SealContext } from "./crypto";

type Cli = {
  encryptSecret: (key: Buffer, plaintext: string, context: Record<string, string>) => string;
  decryptSecret: (key: Buffer, token: string, context: Record<string, string>) => string;
};
const cli = (await import("../../../scripts/dev-academy/credentials.mjs")) as unknown as Cli;

const key = Buffer.alloc(32, 9);
const runId = "run-1";
const subject = "student-ali-1";
const context: SealContext = { purpose: "account-password", projectRef: "abcdefghijklmnopqrst", runId, subject };
const generic = "Sealed value could not be opened.";

describe("seal and open", () => {
  it("round-trips the plaintext under the same key and context", () => {
    const token = seal(key, "s3cret-pässword", context);
    expect(token.startsWith("v1.")).toBe(true);
    expect(token).not.toContain("s3cret");
    expect(open(key, token, context)).toBe("s3cret-pässword");
  });

  it("rejects a wrong key", () => {
    expect(() => open(Buffer.alloc(32, 1), seal(key, "pw", context), context)).toThrow(generic);
  });

  it.each([
    ["purpose", { purpose: "other" }],
    ["projectRef", { projectRef: "tsrqponmlkjihgfedcba" }],
    ["runId", { runId: "run-2" }],
    ["subject", { subject: "student-other" }],
  ])("rejects a wrong context %s", (_name, patch) => {
    expect(() => open(key, seal(key, "pw", context), { ...context, ...patch })).toThrow(generic);
  });

  it("rejects tampered ciphertext and tag", () => {
    const [version, iv, ciphertext, tag] = seal(key, "pw", context).split(".");
    const flipped = Buffer.from(ciphertext, "base64url");
    flipped[0] ^= 1;
    expect(() => open(key, [version, iv, flipped.toString("base64url"), tag].join("."), context)).toThrow(generic);
    const badTag = Buffer.from(tag, "base64url");
    badTag[0] ^= 1;
    expect(() => open(key, [version, iv, ciphertext, badTag.toString("base64url")].join("."), context)).toThrow(generic);
  });

  it("rejects malformed tokens with the generic error", () => {
    expect(() => open(key, "v2.a.b.c", context)).toThrow(generic);
    expect(() => open(key, "garbage", context)).toThrow(generic);
  });

  it.each(["purpose", "projectRef", "runId", "subject"] as const)("throws when a context part contains a colon (%s)", (part) => {
    expect(() => seal(key, "pw", { ...context, [part]: "a:b" })).toThrow("Invalid seal context.");
    expect(() => open(key, "v1.a.b.c", { ...context, [part]: "a:b" })).toThrow(generic);
  });
});

describe("compatibility with scripts/dev-academy/credentials.mjs", () => {
  const cliContext = { purpose: "account-password", projectRef: "abcdefghijklmnopqrst", runId, userId: subject };

  it("opens a value sealed by the CLI", () => {
    const token = cli.encryptSecret(key, "pw", cliContext);
    expect(open(key, token, { ...context })).toBe("pw");
  });

  it("is opened by the CLI decryptSecret when sealed by the web module", () => {
    expect(cli.decryptSecret(key, seal(key, "pw", context), cliContext)).toBe("pw");
  });
});

describe("control tokens", () => {
  it("creates a 43-character base64url token whose hash is 64 hex characters", () => {
    const { token, hash } = newControlToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashControlToken(token));
  });

  it("produces different tokens on each call", () => {
    expect(newControlToken().token).not.toBe(newControlToken().token);
  });
});
