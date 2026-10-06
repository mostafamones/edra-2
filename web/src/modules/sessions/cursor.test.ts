import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor } from "./cursor";

describe("session cursor", () => {
  it("round-trips the last row's start time and id", () => {
    const cursor = { startedAt: "2026-10-05T13:45:12.123456+00:00", id: "0b9c3c1e-8f7a-4b5e-9a2d-1c3e5f7a9b0d" };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("rejects malformed values", () => {
    expect(decodeCursor("not a cursor")).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify({ startedAt: "yesterday", id: "x" })).toString("base64url"))).toBeNull();
  });
});
