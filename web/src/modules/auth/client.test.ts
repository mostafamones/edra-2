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
  signUp,
  recoverPassword,
  verifySignup,
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
    auth.signOut.mockResolvedValue({ error: null });
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    auth.resend.mockResolvedValue({ data: {}, error: null });
    await verifySignup({ phone: "+201001234567", code: "123456" }, "secret123");
    await resendSignupCode("+201001234567");
    expect(auth.verifyOtp).toHaveBeenCalledWith({ phone: "+201001234567", token: "123456", type: "sms" });
    expect(auth.resend).toHaveBeenCalledWith({ phone: "+201001234567", type: "sms" });
  });

  it("replaces the signup phone-code session with a password session", async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
    auth.signOut.mockResolvedValue({ error: null });
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    await expect(verifySignup({ phone: "+201001234567", code: "123456" }, "secret123"))
      .resolves.toEqual({ error: null, signedIn: true });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(auth.signOut.mock.invocationCallOrder[0]).toBeLessThan(auth.signInWithPassword.mock.invocationCallOrder[0]);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ phone: "+201001234567", password: "secret123" });
  });

  it("reports signup verification without a password session when the password is unavailable", async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
    auth.signOut.mockResolvedValue({ error: null });
    await expect(verifySignup({ phone: "+201001234567", code: "123456" }, null))
      .resolves.toEqual({ error: null, signedIn: false });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();

    const failure = new Error("Token has expired or is invalid");
    auth.verifyOtp.mockResolvedValue({ data: {}, error: failure });
    await expect(verifySignup({ phone: "+201001234567", code: "000000" }, "secret123"))
      .resolves.toEqual({ error: failure, signedIn: false });
  });

  it("requests recovery without allowing account creation", async () => {
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    await requestPasswordRecovery("+201001234567");
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      phone: "+201001234567",
      options: { channel: "sms", shouldCreateUser: false },
    });
  });

  it("completes recovery through the server without touching browser auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Bad code" }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(recoverPassword({ phone: "+201001234567", code: "123456", password: "secret123" }))
      .resolves.toEqual({ error: "Bad code" });
    expect(fetchMock).toHaveBeenCalledWith("/auth/recover", expect.objectContaining({ method: "POST" }));
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
