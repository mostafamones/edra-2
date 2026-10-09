import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { completePasswordRecovery, decodeRecoveryTokens, encodeRecoveryTokens, verifyRecoveryCode } from "./recovery";

const input = { phone: "+201001234567", code: "123456" };
const tokens = { accessToken: "a", refreshToken: "r" };

function fakeClient(overrides: Partial<Record<"verifyOtp" | "setSession" | "updateUser" | "signOut", ReturnType<typeof vi.fn>>> = {}) {
  const session = { access_token: "a", refresh_token: "r" };
  const auth = {
    verifyOtp: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    setSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
  return { auth, client: { auth } as unknown as SupabaseClient };
}

describe("server-side recovery code verification", () => {
  it("returns the recovery session tokens for a valid code", async () => {
    const { auth, client } = fakeClient();
    await expect(verifyRecoveryCode(input, client)).resolves.toEqual({ ok: true, tokens });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ phone: input.phone, token: input.code, type: "sms" });
  });

  it("rejects a wrong, expired, or replayed code", async () => {
    const { client } = fakeClient({ verifyOtp: vi.fn().mockResolvedValue({ data: { session: null }, error: new Error("Token has expired or is invalid") }) });
    await expect(verifyRecoveryCode(input, client)).resolves.toEqual({ ok: false, message: "Token has expired or is invalid" });
  });

  it("round-trips cookie tokens and rejects malformed values", () => {
    expect(decodeRecoveryTokens(encodeRecoveryTokens(tokens))).toEqual(tokens);
    expect(decodeRecoveryTokens(undefined)).toBeNull();
    expect(decodeRecoveryTokens("not-json")).toBeNull();
    expect(decodeRecoveryTokens(Buffer.from(JSON.stringify({ accessToken: 1 })).toString("base64url"))).toBeNull();
  });
});

describe("server-side password recovery", () => {
  it("restores the recovery session, updates the password, then signs out globally", async () => {
    const { auth, client } = fakeClient();
    await expect(completePasswordRecovery("newsecret1", tokens, client)).resolves.toEqual({ ok: true });
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: "a", refresh_token: "r" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "newsecret1" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "global" });
  });

  it("does not change the password when the recovery session is no longer valid", async () => {
    const { auth, client } = fakeClient({ setSession: vi.fn().mockResolvedValue({ data: { session: null }, error: new Error("Invalid Refresh Token") }) });
    const result = await completePasswordRecovery("newsecret1", tokens, client);
    expect(result).toMatchObject({ ok: false, stage: "session", passwordUpdated: false });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("keeps the recovery session when the password is rejected so another can be tried", async () => {
    const { auth, client } = fakeClient({ updateUser: vi.fn().mockResolvedValue({ data: {}, error: new Error("New password should be different from the old password.") }) });
    const result = await completePasswordRecovery("newsecret1", tokens, client);
    expect(result).toMatchObject({ ok: false, stage: "update", passwordUpdated: false });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("retries global sign-out and reports a partial failure honestly", async () => {
    const { auth, client } = fakeClient({ signOut: vi.fn().mockResolvedValue({ error: new Error("down") }) });
    const result = await completePasswordRecovery("newsecret1", tokens, client);
    expect(result).toMatchObject({ ok: false, stage: "signout", passwordUpdated: true });
    expect(auth.signOut).toHaveBeenCalledTimes(3);
  });
});
