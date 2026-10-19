import { beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const STUDENT = "33333333-3333-4333-8333-333333333333";
const KEY = "44444444-4444-4444-8444-444444444444";

const state = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown }, calls: [] as { name: string; args: unknown }[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/authority", () => ({ cookieAuthority: async () => null }));

import type { StaffApiContext } from "@/lib/api/handler";
import { addAttendeeResponse, attendeeSearchResponse, bulkResponse, patchResponse, publishResponse, unrecordedAbsenceResponse } from "./v1";

const chain = { select: () => chain, eq: () => chain, is: () => chain, maybeSingle: async () => ({ data: { role: "admin" } }) };
const context = {
  requestId: "req-1", origin: null, methods: "POST",
  authority: {
    userId: "user-1",
    db: { from: () => chain, rpc: async (name: string, args: unknown) => { state.calls.push({ name, args }); return state.result; } },
  },
} as unknown as StaffApiContext;

const entry = (version: number, status = "late") => ({
  annual_student_record_id: STUDENT, full_name: "Amal", archived: false, origin: "expected", group_name: null, status, version,
  source: "manual", updated_at: "2030-01-01T10:00:00Z", updated_by: "user-2", updated_by_name: "Other", checked_in_at: null,
  published_status: null, published_at: null,
});

const request = (body: unknown, key: string | null = KEY) => new Request("http://app.lvh.me:3000/x", {
  method: "POST", headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) }, body: JSON.stringify(body),
});

beforeEach(() => { state.calls = []; state.result = { data: null, error: null }; });

describe("attendance v1 writes", () => {
  it("returns the current row on a stale manual edit and never overwrites it", async () => {
    state.result = { data: { outcome: "conflict", conflicts: [entry(2)], revision: 7 }, error: null };
    const response = await patchResponse(context, request({ status: "present", expected_version: 1 }), ACADEMY, SESSION, STUDENT);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("ATTENDANCE_CONFLICT");
    expect(body.error.details).toMatchObject({ current: { status: "late", version: 2, updated_by_name: "Other" }, revision: 7 });
    expect(state.calls.at(-1)?.args).toMatchObject({
      p_operation: "set", p_key: KEY, p_changes: [{ annual_student_record_id: STUDENT, status: "present", expected_version: 1 }],
    });
  });

  it("applies a bulk change all or nothing and reports every conflict", async () => {
    state.result = { data: { outcome: "updated", changed: 1, entries: [entry(1, "absent")], revision: 4, replayed: true }, error: null };
    const ok = await bulkResponse(context, request({ changes: [{ annual_student_record_id: STUDENT, status: "absent", expected_version: 0 }] }), ACADEMY, SESSION);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ outcome: "updated", changed: 1, revision: 4, replayed: true });

    const duplicate = { annual_student_record_id: STUDENT, status: "absent", expected_version: 0 };
    const twice = await bulkResponse(context, request({ changes: [duplicate, duplicate] }), ACADEMY, SESSION);
    expect(twice.status).toBe(400);
    expect((await bulkResponse(context, request({ changes: [] }), ACADEMY, SESSION)).status).toBe(400);
    expect((await bulkResponse(context, request({ changes: [duplicate] }, null), ACADEMY, SESSION)).status).toBe(400);
  });

  it("requires a fresh review when attendance changed before publication", async () => {
    state.result = { data: null, error: { code: "P0001", message: "publication_stale" } };
    const stale = await publishResponse(context, request({ expected_revision: 3 }), ACADEMY, SESSION);
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe("PUBLICATION_STALE");

    state.result = { data: { outcome: "published", publication_id: "p-1", revision: 3, item_count: 5, replayed: false }, error: null };
    const published = await publishResponse(context, request({ expected_revision: 3 }), ACADEMY, SESSION);
    expect(await published.json()).toEqual({ outcome: "published", publication_id: "p-1", revision: 3, item_count: 5, replayed: false });
    expect((await publishResponse(context, request({ expected_revision: -1 }), ACADEMY, SESSION)).status).toBe(400);
  });

  it("marks every remaining expected absence against the reviewed revision, with a stable stale code", async () => {
    state.result = { data: { outcome: "updated", changed: 1001, revision: 8, replayed: false }, error: null };
    const ok = await unrecordedAbsenceResponse(context, request({ expected_revision: 7 }), ACADEMY, SESSION);
    expect(await ok.json()).toEqual({ outcome: "updated", changed: 1001, revision: 8, replayed: false });
    expect(state.calls.at(-1)).toEqual({ name: "mark_unrecorded_absent", args: { p_academy_id: ACADEMY, p_session_id: SESSION, p_expected_revision: 7, p_key: KEY } });

    state.result = { data: { outcome: "stale", changed: 0, revision: 9, replayed: false }, error: null };
    const stale = await unrecordedAbsenceResponse(context, request({ expected_revision: 7 }), ACADEMY, SESSION);
    expect(stale.status).toBe(409);
    expect((await stale.json()).error).toMatchObject({ code: "ATTENDANCE_REVIEW_STALE", details: { revision: 9 } });

    state.calls = [];
    expect((await unrecordedAbsenceResponse(context, request({ expected_revision: 7 }, null), ACADEMY, SESSION)).status).toBe(400);
    expect((await unrecordedAbsenceResponse(context, request({}), ACADEMY, SESSION)).status).toBe(400);
    expect((await unrecordedAbsenceResponse(context, request({ expected_revision: 7, changes: [] }), ACADEMY, SESSION)).status).toBe(400);
    expect(state.calls).toEqual([]);
  });

  it("searches and adds unexpected attendees", async () => {
    state.result = { data: { items: [], has_more: false }, error: null };
    const search = await attendeeSearchResponse(context, new Request("http://app.lvh.me:3000/x?q=0042&limit=5&offset=10"), ACADEMY, SESSION);
    expect(await search.json()).toEqual({ items: [], has_more: false });
    expect(state.calls.at(-1)?.args).toEqual({ p_academy_id: ACADEMY, p_session_id: SESSION, p_query: "0042", p_limit: 5, p_offset: 10 });
    expect((await attendeeSearchResponse(context, new Request("http://app.lvh.me:3000/x?limit=500"), ACADEMY, SESSION)).status).toBe(400);

    state.result = { data: { outcome: "already_on_roster", entry: entry(1, "present"), revision: 4, replayed: false }, error: null };
    const added = await addAttendeeResponse(context, request({ annual_student_record_id: STUDENT, expected_revision: 4 }), ACADEMY, SESSION);
    expect(await added.json()).toMatchObject({ outcome: "already_on_roster", entry: { status: "present" }, revision: 4 });

    state.result = { data: null, error: { code: "P0001", message: "student_archived" } };
    const archived = await addAttendeeResponse(context, request({ annual_student_record_id: STUDENT, expected_revision: 4 }), ACADEMY, SESSION);
    expect(archived.status).toBe(409);
    expect((await archived.json()).error.code).toBe("STUDENT_ARCHIVED");

    state.result = { data: { outcome: "stale", entry: null, revision: 6, replayed: false }, error: null };
    const stale = await addAttendeeResponse(context, request({ annual_student_record_id: STUDENT, expected_revision: 4 }), ACADEMY, SESSION);
    expect((await stale.json()).error).toMatchObject({ code: "ATTENDANCE_REVIEW_STALE", details: { revision: 6 } });
    expect((await addAttendeeResponse(context, request({ annual_student_record_id: "x", expected_revision: 4 }), ACADEMY, SESSION)).status).toBe(400);
  });
});
