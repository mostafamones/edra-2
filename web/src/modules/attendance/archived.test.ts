import { beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const KEY = "44444444-4444-4444-8444-444444444444";

const state = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/authority", () => ({ cookieAuthority: async () => null }));

import type { StaffApiContext } from "@/lib/api/handler";
import type { Authority } from "@/lib/supabase/authority";
import { getAttendance } from "./data";
import { publishResponse } from "./v1";

const chain = { select: () => chain, eq: () => chain, is: () => chain, maybeSingle: async () => ({ data: { role: "admin" } }) };
const authority = { userId: "user-1", db: { from: () => chain, rpc: async () => state.result } } as unknown as Authority;
const context = { requestId: "req-1", origin: null, methods: "POST", authority } as unknown as StaffApiContext;

const sheet = (session: Record<string, unknown>) => ({
  session: {
    id: SESSION, academy_id: ACADEMY, academic_year_id: "y", schedule_title: "Nine A", group_name: null, mandatory: true,
    location: null, started_at: "2030-01-01T10:00:00Z", auto_end_at: "2030-01-01T12:00:00Z", state: "ended",
    ended_at: "2030-01-01T11:00:00Z", year_open: true, ...session,
  },
  revision: 2, published_revision: 2, publication_count: 1, last_published_at: "2030-01-01T11:00:00Z", last_published_by_name: "U",
  entries: [],
});

beforeEach(() => { state.result = { data: null, error: null }; });

describe("archived attendance", () => {
  it("is read-only for every action and says the session is archived", async () => {
    state.result = { data: sheet({ archived_at: "2030-01-02T09:00:00Z", metadata_version: 5 }), error: null };
    const result = await getAttendance(ACADEMY, SESSION, authority);
    if (!result.ok) throw new Error("expected a sheet");
    expect(result.data.permittedActions).toEqual({ checkIn: false, edit: false, publish: false });
    expect(result.data.session).toMatchObject({ archivedAt: "2030-01-02T09:00:00Z", yearOpen: true, metadataVersion: 5 });
  });

  it("keeps ordinary ended-session review for an unarchived session, including before the migration", async () => {
    state.result = { data: sheet({}), error: null };
    const result = await getAttendance(ACADEMY, SESSION, authority);
    if (!result.ok) throw new Error("expected a sheet");
    expect(result.data.permittedActions).toEqual({ checkIn: false, edit: true, publish: true });
    expect(result.data.session.archivedAt).toBeNull();
  });

  it("maps a rejected write on an archived session to SESSION_ARCHIVED", async () => {
    state.result = { data: null, error: { code: "P0001", message: "session_archived" } };
    const response = await publishResponse(context, new Request("http://app.lvh.me:3000/x", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": KEY }, body: JSON.stringify({ expected_revision: 2 }),
    }), ACADEMY, SESSION);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("SESSION_ARCHIVED");
  });
});
