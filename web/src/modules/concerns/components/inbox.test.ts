import { describe, expect, it } from "vitest";
import { shortWhen } from "./inbox";

describe("shortWhen", () => {
  const now = new Date(2026, 10, 28, 15, 0);
  it("uses time today, then yesterday, weekday and date", () => {
    expect(shortWhen(new Date(2026, 10, 28, 9, 5).toISOString(), now)).toMatch(/9/);
    expect(shortWhen(new Date(2026, 10, 27, 23, 0).toISOString(), now)).toBe("Yesterday");
    expect(shortWhen(new Date(2026, 10, 24).toISOString(), now)).toBe(new Date(2026, 10, 24).toLocaleDateString([], { weekday: "short" }));
    expect(shortWhen(new Date(2025, 0, 3).toISOString(), now)).toMatch(/2025/);
  });
});
