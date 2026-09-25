import { describe, expect, it } from "vitest";

import { resetPasswordSchema, signInSchema, signUpSchema, verificationSchema } from "./validation";

describe("auth input validation", () => {
  it("normalizes an Egyptian mobile number for sign in", () => {
    const input = { phone: "0100 123 4567", password: "secret123" };

    expect(signInSchema.parse(input)).toEqual({
      phone: "+201001234567",
      password: "secret123",
    });
  });

  it("accepts separate signup names and combines them for the profile", () => {
    expect(signUpSchema.parse({
      firstName: "  Mostafa ",
      lastName: "Mones ",
      phone: "+201001234567",
      password: "secret123",
    })).toEqual({
      fullName: "Mostafa Mones",
      phone: "+201001234567",
      password: "secret123",
    });
  });

  it("rejects non-Egyptian numbers, weak passwords, and missing signup names", () => {
    expect(signInSchema.safeParse({ phone: "+14155552671", password: "secret123" }).success).toBe(false);
    expect(signInSchema.safeParse({ phone: "01001234567", password: "short" }).success).toBe(false);
    expect(signUpSchema.safeParse({
      firstName: "Mostafa",
      lastName: " ",
      phone: "01001234567",
      password: "secret123",
    }).success).toBe(false);
  });

  it("requires an exact six-digit verification code", () => {
    expect(verificationSchema.safeParse({ phone: "01001234567", code: "123456" }).success).toBe(true);
    expect(verificationSchema.safeParse({ phone: "01001234567", code: "12345" }).success).toBe(false);
    expect(verificationSchema.safeParse({ phone: "01001234567", code: "12345a" }).success).toBe(false);
  });

  it("validates new password confirmation", () => {
    expect(resetPasswordSchema.safeParse({ password: "secret123", confirmPassword: "secret123" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ password: "secret123", confirmPassword: "different" }).success).toBe(false);
  });
});
