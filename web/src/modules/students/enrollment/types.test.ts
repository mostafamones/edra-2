import { describe, expect, it } from "vitest";

import { isStudentInviteToken, isTerminalJoinState, parseStudentJoinState } from "./types";

const academy = { id: "8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Academy", slug: "academy", icon: "school" };

describe("student join state", () => {
  it("maps database results to screen states", () => {
    expect(parseStudentJoinState({ result: "connected", academy })).toEqual({ kind: "connected", academy });
    expect(parseStudentJoinState({ result: "staff_help", reason: "archived", academy })).toEqual({ kind: "staff_help", reason: "archived", academy });
    expect(parseStudentJoinState({ result: "invalid" })).toEqual({ kind: "invalid" });
    const enroll = parseStudentJoinState({
      result: "enroll", returning: true, academy,
      programs: [{ levelId: "secondary-2", levelName: "Secondary 2", trackId: null, trackName: null, groups: [] }],
    });
    expect(enroll.kind === "enroll" && enroll.returning).toBe(true);
  });

  it("treats unknown or malformed responses as errors", () => {
    expect(parseStudentJoinState({ result: "joined", academy })).toEqual({ kind: "error" });
    expect(parseStudentJoinState({ result: "existing", academy })).toEqual({ kind: "error" });
    expect(parseStudentJoinState(null)).toEqual({ kind: "error" });
  });

  it("clears the pending invite only when it cannot lead anywhere", () => {
    expect(isTerminalJoinState({ kind: "connected", academy })).toBe(true);
    expect(isTerminalJoinState({ kind: "invalid" })).toBe(true);
    expect(isTerminalJoinState({ kind: "closed", academy })).toBe(false);
    expect(isTerminalJoinState({ kind: "error" })).toBe(false);
  });

  it("accepts only 43-character base64url tokens", () => {
    expect(isStudentInviteToken("A".repeat(42) + "-")).toBe(true);
    expect(isStudentInviteToken("A".repeat(42))).toBe(false);
    expect(isStudentInviteToken("A".repeat(42) + "=")).toBe(false);
  });
});
