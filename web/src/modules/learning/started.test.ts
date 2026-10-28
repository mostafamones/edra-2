import { describe, expect, it } from "vitest";

import { unitFinished, unitStarted, unitStatus } from "./started";

describe("unitStarted", () => {
  it("needs a completed or partly watched item", () => {
    expect(unitStarted({})).toBe(false);
    expect(unitStarted({ progress: { items: [{ completed: false, watchedSeconds: 0 }] } })).toBe(false);
    expect(unitStarted({ progress: { items: [{ completed: false, watchedSeconds: 12 }] } })).toBe(true);
    expect(unitStarted({ progress: { items: [{ completed: true }] } })).toBe(true);
  });
});

describe("unitStatus", () => {
  it("distinguishes completed, expired, and both together", () => {
    const complete = { items: [], completed: 2, total: 2 };
    const incomplete = { items: [], completed: 1, total: 2 };
    expect(unitStatus({ access: { status: "active" }, progress: incomplete })).toBe("active");
    expect(unitStatus({ access: { status: "active" }, progress: complete })).toBe("completed");
    expect(unitStatus({ access: { status: "expired" }, progress: incomplete })).toBe("expired");
    expect(unitStatus({ access: { status: "expired" }, progress: complete })).toBe("finished");
    expect(unitStatus({ access: { status: "active", expiresAt: "2026-01-01T00:00:00Z" }, progress: complete }, Date.parse("2026-01-02T00:00:00Z"))).toBe("finished");
  });
});

describe("unitFinished", () => {
  it("is fully completed or expired", () => {
    const active = { status: "active" };
    expect(unitFinished({ access: active })).toBe(false);
    expect(unitFinished({ access: active, progress: { items: [], completed: 0, total: 0 } })).toBe(false);
    expect(unitFinished({ access: active, progress: { items: [], completed: 2, total: 3 } })).toBe(false);
    expect(unitFinished({ access: active, progress: { items: [], completed: 3, total: 3 } })).toBe(true);
    expect(unitFinished({ access: { status: "expired" } })).toBe(true);
    expect(unitFinished({ access: { status: "active", expiresAt: "2026-01-01T00:00:00Z" } }, Date.parse("2026-01-02T00:00:00Z"))).toBe(true);
    expect(unitFinished({ access: { status: "active", expiresAt: "2026-01-03T00:00:00Z" } }, Date.parse("2026-01-02T00:00:00Z"))).toBe(false);
  });
});
