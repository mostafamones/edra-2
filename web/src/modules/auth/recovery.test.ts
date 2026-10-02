import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { completePasswordRecovery } from "./recovery";

const input = { phone: "+201001234567", code: "123456", password: "newsecret1" };

function fakeClient(overrides: Partial<Record<"verifyOtp" | "updateUser" | "signOut", ReturnType<typeof vi.fn>>> = {}) {
  const auth = {
    verifyOtp: vi.fn().mockResolvedValue({ data: { session: { access_token: "t" } }, error: null }),
    updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
  return { auth, client: { auth } as unknown as SupabaseClient };
}

describe("server-side password recovery", () => {
  it("verifies, updates the password, then signs out globally", async () => {
    const { auth, client } = fakeClient();
    await expect(completePasswordRecovery(input, client)).resolves.toEqual({ ok: true });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ phone: input.phone, token: input.code, type: "sms" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: input.password });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "global" });
  });

  it("does not change the password when the code is expired or replayed", async () => {
    const { auth, client } = fakeClient({ verifyOtp: vi.fn().mockResolvedValue({ data: { session: null }, error: new Error("Token has expired or is invalid") }) });
    const result = await completePasswordRecovery(input, client);
    expect(result).toMatchObject({ ok: false, stage: "verify", passwordUpdated: false });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("revokes the scoped session when the password update fails", async () => {
    const { auth, client } = fakeClient({ updateUser: vi.fn().mockResolvedValue({ data: {}, error: new Error("weak password") }) });
    const result = await completePasswordRecovery(input, client);
    expect(result).toMatchObject({ ok: false, stage: "update", passwordUpdated: false });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(auth.signOut).not.toHaveBeenCalledWith({ scope: "global" });
  });

  it("retries global sign-out and reports a partial failure honestly", async () => {
    const { auth, client } = fakeClient({ signOut: vi.fn().mockResolvedValue({ error: new Error("down") }) });
    const result = await completePasswordRecovery(input, client);
    expect(result).toMatchObject({ ok: false, stage: "signout", passwordUpdated: true });
    expect(auth.signOut).toHaveBeenCalledTimes(3);
  });
});
