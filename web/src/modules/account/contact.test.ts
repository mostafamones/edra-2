import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("./client", () => ({ invokeAccountFunction: (...args: unknown[]) => invoke(...args) }));

import { contactErrorMessage, displayPhone, endsContactChange, fetchContacts, verifyContactCode } from "./contact";

const operation = {
  id: "11111111-1111-4111-8111-111111111111", purpose: "login_phone", stage: "new", newPhone: "+201112223333",
  recipientLast4: "3333", codeSent: true, expiresAt: null, retryAt: null,
};

describe("account contact client", () => {
  beforeEach(() => invoke.mockReset());

  it("accepts a student-less account with no parent phone or operation", async () => {
    invoke.mockResolvedValue({ ok: true, value: { loginPhone: "+201012345678", parentPhone: null, operations: [] } });
    expect(await fetchContacts()).toEqual({ ok: true, value: { loginPhone: "+201012345678", parentPhone: null, operations: [] } });
    expect(invoke).toHaveBeenCalledWith("account-contact", { action: "status" });
  });

  it("treats an unexpected payload as a failure, never a partial state", async () => {
    invoke.mockResolvedValue({ ok: true, value: { loginPhone: 1 } });
    expect(await fetchContacts()).toEqual({ ok: false, error: "unavailable" });
  });

  it("distinguishes the next stage from completion", async () => {
    invoke.mockResolvedValueOnce({ ok: true, value: { operation } });
    expect(await verifyContactCode(operation.id, "123456")).toEqual({ ok: true, value: { operation } });
    invoke.mockResolvedValueOnce({ ok: true, value: { completed: true } });
    expect(await verifyContactCode(operation.id, "123456")).toEqual({ ok: true, value: { completed: true } });
  });

  it("restarts only when the operation cannot continue", () => {
    expect(endsContactChange("stale")).toBe(true);
    expect(endsContactChange("phone_taken")).toBe(true);
    expect(endsContactChange("invalid_code")).toBe(false);
    expect(endsContactChange("commit_failed")).toBe(false);
    expect(endsContactChange("cooldown")).toBe(false);
  });

  it("maps conflicts and displays domestic numbers", () => {
    expect(contactErrorMessage("phone_taken")).toMatch(/another account/);
    expect(displayPhone("+201012345678")).toBe("01012345678");
  });
});
