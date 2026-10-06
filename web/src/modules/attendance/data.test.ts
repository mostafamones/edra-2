import { beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const STUDENT = "33333333-3333-4333-8333-333333333333";
const KEY = "44444444-4444-4444-8444-444444444444";

const state = vi.hoisted(() => ({ rpc: [] as { name: string; args: Record<string, unknown> }[], replayed: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/authority", () => ({ cookieAuthority: async () => null }));

import type { Authority } from "@/lib/supabase/authority";
import { checkIn } from "./data";

const entry = (status: string, version: number) => ({
  annual_student_record_id: STUDENT, full_name: "Amal", archived: false, origin: "expected", group_name: null, status, version,
  source: "check_in", updated_at: "2030-01-01T10:30:00Z", updated_by: "u", updated_by_name: "U",
  checked_in_at: "2030-01-01T10:30:00Z", published_status: null, published_at: null,
});

const table = (row: unknown) => {
  const chain: Record<string, unknown> = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row }) };
  return chain;
};
const authority = {
  userId: "u",
  db: {
    from: (name: string) => table(name === "sessions" ? { started_at: "2030-01-01T10:00:00Z" } : { role: "instructor" }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpc.push({ name, args });
      if (name === "apply_attendance_changes") {
        return { data: { outcome: "updated", changed: 1, entries: [entry("late", 2)], revision: 5, replayed: false }, error: null };
      }
      return { data: { outcome: "recorded", entry: entry("present", 1), revision: 4, correction_pending: false, replayed: state.replayed }, error: null };
    },
  },
} as unknown as Authority;

const base = { academyId: ACADEMY, sessionId: SESSION, idempotencyKey: KEY };
beforeEach(() => { state.rpc = []; state.replayed = false; });

describe("checkIn identifiers", () => {
  it("keeps the UUID command and its payload unchanged", async () => {
    const result = await checkIn({ ...base, annualStudentRecordId: STUDENT }, authority);
    expect(result.ok && result.outcome).toBe("recorded");
    expect(state.rpc).toEqual([{
      name: "check_in_attendance",
      args: { p_academy_id: ACADEMY, p_session_id: SESSION, p_annual_record_id: STUDENT, p_key: KEY },
    }]);
  });

  it("sends a code to the database once, never resolving a UUID in JavaScript", async () => {
    await checkIn({ ...base, studentCode: " 00x7 " }, authority);
    expect(state.rpc.map((call) => call.name)).toEqual(["check_in_attendance_by_code"]);
    expect(state.rpc[0].args).toMatchObject({ p_code: "00X7", p_late_after_minutes: 0 });
  });

  it("rejects missing, double, and malformed identifiers before any call", async () => {
    for (const input of [base, { ...base, studentCode: "1", annualStudentRecordId: STUDENT }, { ...base, studentCode: "a b" }, { ...base, studentCode: "٣٣" }]) {
      const result = await checkIn(input as never, authority);
      expect(result.ok === false && result.code).toBe("validation");
    }
    expect(state.rpc).toEqual([]);
  });

  it("applies Late-after to both identifiers, but never to a replay", async () => {
    for (const who of [{ annualStudentRecordId: STUDENT }, { studentCode: "0042" }]) {
      state.rpc = [];
      const late = await checkIn({ ...base, ...who, lateAfterMinutes: 10 }, authority);
      expect(late.ok && late.entry.status).toBe("late");
      expect(state.rpc.at(-1)?.name).toBe("apply_attendance_changes");
    }
    state.rpc = []; state.replayed = true;
    const replay = await checkIn({ ...base, studentCode: "0042", lateAfterMinutes: 10 }, authority);
    expect(replay.ok && replay.entry.status).toBe("present");
    expect(state.rpc.map((call) => call.name)).toEqual(["check_in_attendance_by_code"]);
  });
});
