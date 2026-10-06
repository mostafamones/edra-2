import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isStaffInviteToken } from "./link";
import { decryptInviteToken, encryptInviteToken, generateInviteToken, staffInviteLink } from "./secret";

const academyA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const academyB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("staff invitation secrets", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.STAFF_INVITE_LINK_KEY = randomBytes(32).toString("base64");
    process.env.EDRA_APP_ORIGIN = "https://edra.example";
  });
  afterEach(() => { process.env = { ...env }; });

  it("generates high-entropy tokens in the accepted format", () => {
    const first = generateInviteToken();
    expect(isStaffInviteToken(first)).toBe(true);
    expect(generateInviteToken()).not.toBe(first);
  });

  it("round-trips a token bound to its academy", () => {
    const token = generateInviteToken();
    const ciphertext = encryptInviteToken(token, academyA);
    expect(ciphertext).not.toContain(token);
    expect(decryptInviteToken(ciphertext, academyA)).toBe(token);
    expect(decryptInviteToken(ciphertext, academyB)).toBeNull();
    // Mutate a significant tag byte, rather than unused base64 padding bits.
    const pieces = ciphertext.split(".");
    pieces[3] = (pieces[3][0] === "A" ? "B" : "A") + pieces[3].slice(1);
    expect(decryptInviteToken(pieces.join("."), academyA)).toBeNull();
    expect(decryptInviteToken("garbage", academyA)).toBeNull();
  });

  it("fails closed without a valid key", () => {
    process.env.STAFF_INVITE_LINK_KEY = "short";
    expect(() => encryptInviteToken("x", academyA)).toThrow();
  });

  it("builds links from the configured origin only", () => {
    expect(staffInviteLink("abc")).toBe("https://edra.example/invite/staff/abc");
  });
});
