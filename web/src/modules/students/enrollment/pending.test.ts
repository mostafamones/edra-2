import { describe, expect, it } from "vitest";

import { parsePendingStudentEntry, pendingStudentEntryValue } from "./pending";

const token = "A".repeat(42) + "_";

describe("pending student entry", () => {
  it("keeps ordinary invites as bare tokens and marks booking entries", () => {
    expect(parsePendingStudentEntry(token)).toEqual({ kind: "invite", token });
    expect(pendingStudentEntryValue({ kind: "booking", token })).toBe(`booking.${token}`);
    expect(parsePendingStudentEntry(`booking.${token}`)).toEqual({ kind: "booking", token });
  });

  it("rejects malformed values and reports nothing pending", () => {
    expect(parsePendingStudentEntry(undefined)).toBeNull();
    expect(parsePendingStudentEntry("booking.bad")).toBe("invalid");
    expect(parsePendingStudentEntry(`invite.${token}`)).toBe("invalid");
  });
});
