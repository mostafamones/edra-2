import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  verifyOtp: vi.fn(),
  resend: vi.fn(),
  signInWithOtp: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth }) }));

import {
  requestPasswordRecovery,
  resendSignupCode,
  signIn,
  signOutEverywhere,
  signUp,
  updateRecoveredPassword,
  verifyPhoneCode,
} from "./client";

describe("phone authentication client", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes successful and failed password sign-ins through", async () => {
    const failure = { data: { user: null, session: null }, error: new Error("Invalid login credentials") };
    const success = { data: { user: { id: "user-1" }, session: { access_token: "token" } }, error: null };
    auth.signInWithPassword.mockResolvedValueOnce(failure).mockResolvedValueOnce(success);

    await expect(signIn({ phone: "+201001234567", password: "secret123" })).resolves.toBe(failure);
    await expect(signIn({ phone: "+201001234567", password: "secret123" })).resolves.toBe(success);
  });

  it("signs up with full-name metadata and SMS hook delivery", async () => {
    auth.signUp.mockResolvedValue({ data: {}, error: null });
    await signUp({ fullName: "Mostafa Mones", phone: "+201001234567", password: "secret123" });
    expect(auth.signUp).toHaveBeenCalledWith({
      phone: "+201001234567",
      password: "secret123",
      options: { channel: "sms", data: { full_name: "Mostafa Mones" } },
    });
  });

  it("verifies and resends signup codes as sms verification types", async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
    auth.resend.mockResolvedValue({ data: {}, error: null });
    await verifyPhoneCode({ phone: "+201001234567", code: "123456" });
    await resendSignupCode("+201001234567");
    expect(auth.verifyOtp).toHaveBeenCalledWith({ phone: "+201001234567", token: "123456", type: "sms" });
    expect(auth.resend).toHaveBeenCalledWith({ phone: "+201001234567", type: "sms" });
  });

  it("requests recovery without allowing account creation", async () => {
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    await requestPasswordRecovery("+201001234567");
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      phone: "+201001234567",
      options: { channel: "sms", shouldCreateUser: false },
    });
  });

  it("updates recovered passwords and signs out globally", async () => {
    auth.updateUser.mockResolvedValue({ data: {}, error: null });
    auth.signOut.mockResolvedValue({ error: null });

    await updateRecoveredPassword({ password: "secret123", confirmPassword: "secret123" });
    await signOutEverywhere();

    expect(auth.updateUser).toHaveBeenCalledWith({ password: "secret123" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "global" });
  });
});
