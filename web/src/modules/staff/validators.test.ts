import { expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (schema: { parse: (value: unknown) => unknown }) => ({
      handler: (handler: (input: { data: unknown }) => unknown) =>
        ({ data }: { data: unknown }) => handler({ data: schema.parse(data) }),
    }),
  }),
}));
vi.mock("../../lib/supabase/server", () => ({ createClient: vi.fn() }));

import { changeStaffMemberRole, removeStaffMember, restoreStaffMember, suspendStaffMember } from "./actions";

it("returns the existing member validation failure for malformed IDs", async () => {
  const bad = 42 as unknown as string;
  const id = "10000000-0000-4000-8000-000000000001";
  for (const call of [
    () => changeStaffMemberRole(bad, id, "admin"),
    () => suspendStaffMember(id, bad),
    () => restoreStaffMember(bad, id),
    () => removeStaffMember(id, bad),
  ]) expect(await call()).toEqual({ ok: false, message: "Invalid member." });
});
