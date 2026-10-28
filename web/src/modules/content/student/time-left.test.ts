import { describe, expect, it } from "vitest";

import { timeLeft } from "./time-left";

const now = Date.parse("2026-10-27T12:00:00Z");
const at = (ms: number) => new Date(now + ms).toISOString();

describe("timeLeft", () => {
  it("uses days from two days, hours below that and minutes under an hour", () => {
    expect(timeLeft(at(6.5 * 86_400_000), now)).toEqual({ label: "6d", urgent: false });
    expect(timeLeft(at(36 * 3_600_000), now)).toEqual({ label: "36h", urgent: false });
    expect(timeLeft(at(12 * 3_600_000), now)).toEqual({ label: "12h", urgent: true });
    expect(timeLeft(at(45 * 60_000), now)).toEqual({ label: "45m", urgent: true });
    expect(timeLeft(at(10_000), now)).toEqual({ label: "1m", urgent: true });
  });
  it("is null once passed", () => {
    expect(timeLeft(at(0), now)).toBeNull();
    expect(timeLeft(at(-1000), now)).toBeNull();
  });
});
