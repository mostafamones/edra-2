import { beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const STUDENT = "33333333-3333-4333-8333-333333333333";
const KEY = "44444444-4444-4444-8444-444444444444";

const state = vi.hoisted(() => ({ rpc: [] as { name: string; args: Record<string, unknown> }[], replayed: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/authority", () => ({ cookieAuthority: async () => null }));

import type { Authority } from "@/lib/supabase/authority";
import { addAttendee, checkIn, markUnrecordedAbsent, searchAttendees } from "./data";

const entry = (status: string, version: number) => ({
  annual_student_record_id: STUDENT, full_name: "Amal", archived: false, origin: "expected", group_name: null, status, version,
  source: "check_in", updated_at: "2030-01-01T10:30:00Z", updated_by: "u", updated_by_name: "U",
  checked_in_at: "2030-01-01T10:30:00Z", published_status: null, published_at: null,
});

const table = (row: unknown) => {
  const chain: Record<string, unknown> = { select: () => chain, eq: () => chain, is: () => chain, maybeSingle: async () => ({ data: row }) };
  return chain;
};
const authority = {
  userId: "u",
  db: {
    from: (name: string) => table(name === "sessions" ? { started_at: "2030-01-01T10:00:00Z" } : { role: "instructor" }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpc.push({ name, args });
      if (name === "mark_unrecorded_absent") return { data: { outcome: "stale", changed: 0, revision: 9, replayed: false }, error: null };
      if (name === "search_attendee_candidates") {
        return { data: { items: [{ annual_student_record_id: STUDENT, full_name: "Amal", level_name: "Grade 9", group_name: null,
          participation_type: "online_only", student_code: null }], has_more: true }, error: null };
      }
      if (name === "add_session_attendee") {
        return { data: { outcome: "added", entry: { ...entry("unknown", 0), origin: "unexpected" }, revision: 6, replayed: false }, error: null };
      }
      return { data: { outcome: "recorded", entry: entry("present", 1), revision: 4, correction_pending: false, replayed: state.replayed }, error: null };
    },
  },
} as unknown as Authority;

const base = { academyId: ACADEMY, sessionId: SESSION, idempotencyKey: KEY };
beforeEach(() => { state.rpc = []; state.replayed = false; });

describe("checkIn identifiers", () => {
  it("sends a UUID check-in to the single Late-aware command, with omitted Late-after as 0", async () => {
    const result = await checkIn({ ...base, annualStudentRecordId: STUDENT }, authority);
    expect(result.ok && result.outcome).toBe("recorded");
    expect(state.rpc).toEqual([{
      name: "check_in_attendance_with_late",
      args: { p_academy_id: ACADEMY, p_session_id: SESSION, p_annual_record_id: STUDENT, p_key: KEY, p_late_after_minutes: 0 },
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

  it("sends Late-after with the check-in itself and returns its acknowledgment with no follow-up write", async () => {
    for (const who of [{ annualStudentRecordId: STUDENT }, { studentCode: "0042" }]) {
      state.rpc = [];
      const result = await checkIn({ ...base, ...who, lateAfterMinutes: 10 }, authority);
      expect(result.ok && result.revision).toBe(4);
      expect(state.rpc).toHaveLength(1);
      expect(state.rpc[0].args).toMatchObject({ p_late_after_minutes: 10, p_key: KEY });
    }
  });
});

describe("attendance corrections", () => {
  it("reports a stale all-remaining absence review with the current revision", async () => {
    const result = await markUnrecordedAbsent({ ...base, expectedRevision: 3 }, authority);
    expect(result).toEqual({ ok: true, outcome: "stale", changed: 0, revision: 9, replayed: false });
    expect(state.rpc).toEqual([{ name: "mark_unrecorded_absent", args: { p_academy_id: ACADEMY, p_session_id: SESSION, p_expected_revision: 3, p_key: KEY } }]);
    expect((await markUnrecordedAbsent({ ...base, expectedRevision: -1 }, authority)).ok).toBe(false);
  });

  it("searches candidates with bounded paging and appends an unexpected attendee", async () => {
    const found = await searchAttendees({ academyId: ACADEMY, sessionId: SESSION, query: "am" }, authority);
    expect(found.ok && found.items[0]).toMatchObject({ annualStudentRecordId: STUDENT, participationType: "online_only" });
    expect(state.rpc.at(-1)?.args).toEqual({ p_academy_id: ACADEMY, p_session_id: SESSION, p_query: "am", p_limit: 20, p_offset: 0 });
    expect((await searchAttendees({ academyId: ACADEMY, sessionId: SESSION, query: "x", limit: 51 }, authority)).ok).toBe(false);
    const added = await addAttendee({ ...base, annualStudentRecordId: STUDENT, expectedRevision: 5 }, authority);
    expect(added.ok && added.outcome === "added" && added.entry.origin).toBe("unexpected");
    expect(state.rpc.at(-1)).toEqual({ name: "add_session_attendee", args: {
      p_academy_id: ACADEMY, p_session_id: SESSION, p_record_id: STUDENT, p_expected_revision: 5, p_key: KEY,
    } });
  });
});
