import { describe, expect, it } from "vitest";

import { isTerminalJoinState, parseJoinResponse } from "./types";

const academy = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Academy", slug: "academy", icon: "school" };

describe("join responses", () => {
  it("keeps academy details for the invited account", () => {
    expect(parseJoinResponse({ result: "valid", role: "admin", expiresAt: "2030-01-01T00:00:00Z", academy }))
      .toEqual({ kind: "valid", role: "admin", expiresAt: "2030-01-01T00:00:00Z", academy });
  });

  it("drops any extra detail from generic states", () => {
    expect(parseJoinResponse({ result: "wrong_account", academy })).toEqual({ kind: "wrong_account" });
    expect(parseJoinResponse({ result: "unavailable" })).toEqual({ kind: "unavailable" });
  });

  it("treats unknown or incomplete responses as errors", () => {
    expect(parseJoinResponse({ result: "valid" })).toEqual({ kind: "error" });
    expect(parseJoinResponse(null)).toEqual({ kind: "error" });
  });

  it("clears pending context only after terminal outcomes", () => {
    expect(isTerminalJoinState({ kind: "unavailable" })).toBe(true);
    expect(isTerminalJoinState({ kind: "wrong_account" })).toBe(false);
    expect(isTerminalJoinState({ kind: "error" })).toBe(false);
  });
});
