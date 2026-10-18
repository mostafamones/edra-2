import { describe, expect, it } from "vitest";

import { accountName, profileSchema } from "./validation";

describe("account profile validation", () => {
  it("normalizes whitespace and keeps Arabic names", () => {
    expect(profileSchema.parse({ fullName: "  سارة   حسن ", displayName: " سارة " })).toEqual({ fullName: "سارة حسن", displayName: "سارة" });
  });

  it("treats a blank display name as none and requires a full name", () => {
    expect(profileSchema.parse({ fullName: "Sara Hassan", displayName: "   " }).displayName).toBeNull();
    expect(profileSchema.safeParse({ fullName: " \t ", displayName: "" }).success).toBe(false);
    expect(profileSchema.safeParse({ fullName: "a".repeat(201), displayName: "" }).success).toBe(false);
  });

  it("rejects fields other than the two names", () => {
    expect(profileSchema.safeParse({ fullName: "Sara", displayName: "", avatar_path: "x" }).success).toBe(false);
    expect(profileSchema.safeParse({ fullName: "Sara", displayName: "", id: "other" }).success).toBe(false);
  });

  it("accepts the form resolver's normalized output when clearing a display name", () => {
    const submitted = profileSchema.parse({ fullName: "Sara Hassan", displayName: "   " });
    expect(submitted.displayName).toBeNull();
    expect(profileSchema.parse(submitted)).toEqual(submitted);
  });

  it("falls back from display name to full name", () => {
    expect(accountName({ full_name: "Sara Hassan", display_name: "سارة" })).toBe("سارة");
    expect(accountName({ full_name: "Sara Hassan", display_name: null })).toBe("Sara Hassan");
    expect(accountName({ full_name: null, display_name: null })).toBeNull();
  });
});
