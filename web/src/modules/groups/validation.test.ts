import { describe, expect, it } from "vitest";

import { groupInputSchema } from "./validation";

const valid = {
  academyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Sunday A",
  levelId: "grade-10",
  trackId: null,
  capacity: null,
  notes: null,
};

describe("group input", () => {
  it("accepts an optional capacity and staff notes", () => {
    expect(groupInputSchema.safeParse({ ...valid, capacity: 25, notes: "Room 2" }).success).toBe(true);
  });

  it("rejects zero, fractional, and negative capacities", () => {
    for (const capacity of [0, -1, 1.5]) {
      expect(groupInputSchema.safeParse({ ...valid, capacity }).success).toBe(false);
    }
  });

  it("rejects invalid tenant ids and overlong notes", () => {
    expect(groupInputSchema.safeParse({ ...valid, academyId: "other" }).success).toBe(false);
    expect(groupInputSchema.safeParse({ ...valid, notes: "a".repeat(2001) }).success).toBe(false);
  });
});

