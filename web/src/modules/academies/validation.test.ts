import { describe, expect, it } from "vitest";

import { academyQueryKeys } from "./query-keys";
import { createAcademySchema } from "./validation";

describe("academy input validation", () => {
  it("trims names and accepts the database boundaries", () => {
    expect(createAcademySchema.parse({ name: "  Edra  " })).toEqual({ name: "Edra" });
    expect(createAcademySchema.safeParse({ name: "ab" }).success).toBe(true);
    expect(createAcademySchema.safeParse({ name: "a".repeat(100) }).success).toBe(true);
  });

  it("rejects names outside the database boundaries", () => {
    expect(createAcademySchema.safeParse({ name: " a " }).success).toBe(false);
    expect(createAcademySchema.safeParse({ name: "a".repeat(101) }).success).toBe(false);
  });

  it("scopes detail query keys to the academy", () => {
    expect(academyQueryKeys.detail("academy-a")).not.toEqual(
      academyQueryKeys.detail("academy-b"),
    );
    expect(academyQueryKeys.forUser("user-a")).not.toEqual(
      academyQueryKeys.forUser("user-b"),
    );
  });
});
