import { describe, expect, it } from "vitest";

import { staffInvitationSchema } from "./validation";

describe("staff invitation input validation", () => {
  it("accepts instructor and admin invitations", () => {
    expect(staffInvitationSchema.safeParse({ phone: "+201001234567", role: "instructor" }).success).toBe(true);
    expect(staffInvitationSchema.safeParse({ phone: "+201001234567", role: "admin" }).success).toBe(true);
    expect(staffInvitationSchema.safeParse({ phone: "+201001234567", role: "head_admin" }).success).toBe(true);
  });

  it("normalizes local numbers and rejects owner or email invitations", () => {
    expect(staffInvitationSchema.safeParse({ phone: "+201001234567", role: "owner" }).success).toBe(false);
    expect(staffInvitationSchema.safeParse({ phone: "+201001234567", role: "head-admin" }).success).toBe(false);
    expect(staffInvitationSchema.parse({ phone: "01001234567", role: "instructor" }).phone).toBe("+201001234567");
    expect(staffInvitationSchema.safeParse({ email: "a@example.com", role: "instructor" }).success).toBe(false);
  });
});
