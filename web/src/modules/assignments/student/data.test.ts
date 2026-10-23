import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/authority", () => ({ cookieAuthority: vi.fn(async () => null) }));
const { commandSchema, runAssignmentCommand } = await import("./data");

const id = "00000000-0000-4000-8000-000000000001";
const base = { academyId: id, assignmentId: id, token: id, generation: 1, key: id };

describe("student assignment command validation", () => {
  it("accepts only the shared file types and size limit", () => {
    const register = { ...base, operation: "register", partId: id, name: "work.pdf", mime: "application/pdf", size: 8 * 1024 * 1024 };
    expect(commandSchema.safeParse(register).success).toBe(true);
    expect(commandSchema.safeParse({ ...register, size: 8 * 1024 * 1024 + 1 }).success).toBe(false);
    expect(commandSchema.safeParse({ ...register, mime: "image/heic" }).success).toBe(true);
    expect(commandSchema.safeParse({ ...register, mime: "image/gif" }).success).toBe(false);
  });
  it("rejects unknown fields, empty saves and missing fencing", () => {
    expect(commandSchema.safeParse({ ...base, operation: "save", version: 0, answers: {} }).success).toBe(false);
    expect(commandSchema.safeParse({ ...base, operation: "save", version: 0, answers: { [id]: id }, extra: true }).success).toBe(false);
    expect(commandSchema.safeParse({ academyId: id, assignmentId: id, token: id, operation: "submit", version: 0, scoringRevision: 1 }).success).toBe(false);
  });
  it("requires a signed-in caller", async () => {
    expect(await runAssignmentCommand({ academyId: id, assignmentId: id, token: id, operation: "read" })).toMatchObject({ ok: false, code: "forbidden" });
  });
});
