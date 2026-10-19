import { describe, expect, it } from "vitest";

import { endsPasswordChallenge, passwordErrorMessage } from "./client";

describe("password change errors", () => {
  it("shows Auth's actionable password rejection", () => {
    expect(passwordErrorMessage({ ok: false, error: "password_rejected", message: "New password should be different from the old password." }))
      .toBe("New password should be different from the old password.");
  });

  it("never claims an unchanged password after an uncertain update", () => {
    expect(passwordErrorMessage({ ok: false, error: "uncertain" })).toMatch(/couldn’t confirm/);
  });

  it("restarts only for terminal challenge states", () => {
    expect(endsPasswordChallenge("expired")).toBe(true);
    expect(endsPasswordChallenge("invalid_code")).toBe(false);
    expect(endsPasswordChallenge("password_rejected")).toBe(false);
  });
});
