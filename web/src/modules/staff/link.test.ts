import { describe, expect, it } from "vitest";

import { isStaffInviteToken, parseStaffInviteLink } from "./link";

const token = "A".repeat(42) + "_";
const origin = "https://edra.example";

describe("staff invitation links", () => {
  it("accepts full links on the configured origin", () => {
    expect(parseStaffInviteLink(`https://edra.example/invite/staff/${token}`, origin)).toBe(token);
    expect(parseStaffInviteLink(`  https://edra.example/invite/staff/${token}/  `, origin)).toBe(token);
  });

  it("rejects other hosts, paths, credentials, and malformed tokens", () => {
    expect(parseStaffInviteLink(`https://evil.example/invite/staff/${token}`, origin)).toBeNull();
    expect(parseStaffInviteLink(`http://edra.example/invite/staff/${token}`, origin)).toBeNull();
    expect(parseStaffInviteLink(`https://user:pw@edra.example/invite/staff/${token}`, origin)).toBeNull();
    expect(parseStaffInviteLink(`https://edra.example/invite/student/${token}`, origin)).toBeNull();
    expect(parseStaffInviteLink("https://edra.example/invite/staff/short", origin)).toBeNull();
    expect(parseStaffInviteLink(token, origin)).toBe(token);
    expect(parseStaffInviteLink("", origin)).toBeNull();
  });

  it("recognizes only 43-character base64url tokens", () => {
    expect(isStaffInviteToken(token)).toBe(true);
    expect(isStaffInviteToken(`${token}A`)).toBe(false);
    expect(isStaffInviteToken("A".repeat(42) + "=")).toBe(false);
  });
});
