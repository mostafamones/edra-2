import { describe, expect, it } from "vitest";

import { parseStudentInviteLink } from "./link";

const token = "A".repeat(42) + "-";
const origin = "http://learn.lvh.me:3000";

describe("parseStudentInviteLink", () => {
  it("accepts a bare token or a link on the student origin", () => {
    expect(parseStudentInviteLink(` ${token} `, origin)).toBe(token);
    expect(parseStudentInviteLink(`${origin}/invite/student/${token}/`, origin)).toBe(token);
  });

  it("rejects other origins, paths and malformed tokens", () => {
    expect(parseStudentInviteLink(`https://evil.example/invite/student/${token}`, origin)).toBeNull();
    expect(parseStudentInviteLink(`${origin}/invite/staff/${token}`, origin)).toBeNull();
    expect(parseStudentInviteLink(`${origin}/invite/student/short`, origin)).toBeNull();
    expect(parseStudentInviteLink("", origin)).toBeNull();
  });
});
