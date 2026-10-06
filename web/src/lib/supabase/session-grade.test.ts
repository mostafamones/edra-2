import { describe, expect, it } from "vitest";

import { isPhoneCodeSession } from "./session-grade";

describe("isPhoneCodeSession", () => {
  it("accepts password sessions", () => {
    expect(isPhoneCodeSession({ amr: [{ method: "password", timestamp: 1 }] })).toBe(false);
  });

  it("rejects phone-code and recovery sessions", () => {
    expect(isPhoneCodeSession({ amr: [{ method: "otp", timestamp: 1 }] })).toBe(true);
    expect(isPhoneCodeSession({ amr: [{ method: "recovery", timestamp: 1 }] })).toBe(true);
    expect(isPhoneCodeSession({ amr: [{ method: "password", timestamp: 1 }, { method: "otp", timestamp: 2 }] })).toBe(true);
  });

  it("rejects claims without an authentication method", () => {
    expect(isPhoneCodeSession({})).toBe(true);
    expect(isPhoneCodeSession(null)).toBe(true);
    expect(isPhoneCodeSession({ amr: "password" })).toBe(true);
  });
});
