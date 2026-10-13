import { beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const SCHEDULE = "55555555-5555-4555-8555-555555555555";
const KEY = "44444444-4444-4444-8444-444444444444";

const state = vi.hoisted(() => ({
  calls: [] as { name: string; args: Record<string, unknown> }[],
  result: { data: null as unknown, error: null as unknown },
  archivedAt: null as string | null,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/authority", () => ({
  cookieAuthority: async () => ({
    userId: "user-1",
    db: {
      from: (name: string) => {
        const row = name === "sessions" ? { archived_at: state.archivedAt } : { role: "admin" };
        const chain: Record<string, unknown> = { select: () => chain, eq: () => chain, is: () => chain, maybeSingle: async () => ({ data: row }) };
        return chain;
      },
      rpc: async (name: string, args: Record<string, unknown>) => { state.calls.push({ name, args }); return state.result; },
    },
  }),
}));

import { archiveSession, restoreSession, startSession } from "./actions";
import { getSession, listSessionHistory, readSessionHistoryQuery } from "./data";
import { sessionV1 } from "./v1";

const archiveState = (archivedAt: string | null, version = 3) => ({
  id: SESSION, metadata_version: version, state: "ended", ended_at: "2030-01-01T11:00:00Z", end_reason: "manual",
  archived_at: archivedAt, archived_by_name: archivedAt ? "Admin" : null, archive_note: archivedAt ? "Wrong class" : null,
});

const detail = (session: Record<string, unknown>) => ({
  session: {
    id: SESSION, academy_id: ACADEMY, academic_year_id: "y", schedule_id: SCHEDULE, schedule_title: "Nine A", schedule_kind: "recurring",
    audience: "group", group_id: "g", group_name: "Nine A", level_id: "grade-9", level_name: "Grade 9", track_id: null, track_name: null,
    mandatory: true, location: null, state: "ended", started_at: "2030-01-01T10:00:00Z", started_by: "u", started_by_name: "U",
    auto_end_at: "2030-01-01T12:00:00Z", metadata_version: 3, ended_at: "2030-01-01T11:00:00Z", ended_by: "u", ended_by_name: "U",
    end_reason: "manual", archived_at: null, archived_by_name: null, archive_note: null, year_open: true, can_manage_archive: true,
    ...session,
  },
  roster: [],
  archive_impact: { roster_count: 4, official_count: 2, draft_count: 1, pending_effects: 1 },
  archive_events: [],
});

beforeEach(() => { state.calls = []; state.result = { data: null, error: null }; state.archivedAt = null; });

describe("archive and restore actions", () => {
  it("sends the reviewed version, retry key and trimmed note, and maps the acknowledgment", async () => {
    state.result = { data: { outcome: "archived", session: archiveState("2030-01-02T09:00:00Z", 5), ended_live: true, stopped_effects: 1, replayed: false }, error: null };
    const result = await archiveSession({ academyId: ACADEMY, sessionId: SESSION, expectedVersion: 3, idempotencyKey: KEY, note: "  Wrong class " });
    expect(state.calls).toEqual([{
      name: "archive_session",
      args: { p_academy_id: ACADEMY, p_session_id: SESSION, p_expected_version: 3, p_key: KEY, p_note: "Wrong class" },
    }]);
    expect(result).toMatchObject({
      ok: true, outcome: "archived", endedLive: true, stoppedEffects: 1, replayed: false,
      session: { metadataVersion: 5, sessionArchivedAt: "2030-01-02T09:00:00Z", archiveNote: "Wrong class" },
    });
  });

  it("reports a stale version as a conflict without treating it as success", async () => {
    state.result = { data: { outcome: "conflict", session: archiveState(null, 4), stopped_effects: 0, replayed: false }, error: null };
    const result = await restoreSession({ academyId: ACADEMY, sessionId: SESSION, expectedVersion: 3, idempotencyKey: KEY });
    expect(state.calls[0].name).toBe("restore_session");
    expect(state.calls[0].args).not.toHaveProperty("p_note");
    expect(result.ok && result.outcome).toBe("conflict");
  });

  it("maps database denials and rejects malformed input before any call", async () => {
    state.result = { data: null, error: { code: "P0001", message: "forbidden" } };
    const denied = await archiveSession({ academyId: ACADEMY, sessionId: SESSION, expectedVersion: 3, idempotencyKey: KEY });
    expect(denied.ok === false && denied.code).toBe("forbidden");
    state.calls = [];
    for (const input of [
      { academyId: ACADEMY, sessionId: SESSION, expectedVersion: 0, idempotencyKey: KEY },
      { academyId: ACADEMY, sessionId: SESSION, expectedVersion: 3 },
      { academyId: ACADEMY, sessionId: SESSION, expectedVersion: 3, idempotencyKey: KEY, note: "x".repeat(501) },
    ]) {
      const result = await archiveSession(input);
      expect(result.ok === false && result.code).toBe("validation");
    }
    state.result = { data: { outcome: "not_archived", session: archiveState(null), stopped_effects: 0, replayed: false }, error: null };
    const restoreWithNote = await restoreSession({ academyId: ACADEMY, sessionId: SESSION, expectedVersion: 3, idempotencyKey: KEY, note: "x" });
    expect(restoreWithNote.ok).toBe(true);
    expect(state.calls.map((call) => call.name)).toEqual(["restore_session"]);
    expect(state.calls[0].args).not.toHaveProperty("p_note");
  });

  it("flags a replayed start whose session was archived since", async () => {
    state.result = { data: [{ session_id: SESSION, outcome: "replayed" }], error: null };
    state.archivedAt = "2030-01-02T09:00:00Z";
    const result = await startSession({ academyId: ACADEMY, scheduleId: SCHEDULE, startKey: KEY });
    expect(result).toEqual({ ok: true, sessionId: SESSION, outcome: "replayed", archived: true });
  });
});

describe("archive-aware reads", () => {
  it("parses the history archive filter and defaults to unarchived sessions", async () => {
    expect(readSessionHistoryQuery(new URLSearchParams({ archive: "archived" }))?.archive).toBe("archived");
    expect(readSessionHistoryQuery(new URLSearchParams({ archive: "all" }))?.archive).toBe("all");
    expect(readSessionHistoryQuery(new URLSearchParams())?.archive).toBeNull();
    expect(readSessionHistoryQuery(new URLSearchParams({ archive: "deleted" }))).toBeNull();
    state.result = { data: [], error: null };
    await listSessionHistory({ academyId: ACADEMY });
    expect(state.calls[0].args).toMatchObject({ p_archive: "active" });
  });

  it("offers archive or restore only to managers in an open year", async () => {
    const actions = async (session: Record<string, unknown>) => {
      state.result = { data: detail(session), error: null };
      const result = await getSession(ACADEMY, SESSION);
      return result.ok ? result.data.permittedActions : null;
    };
    expect(await actions({})).toEqual({ archive: true, restore: false });
    expect(await actions({ archived_at: "2030-01-02T09:00:00Z", archived_by_name: "Admin" })).toEqual({ archive: false, restore: true });
    expect(await actions({ year_open: false })).toEqual({ archive: false, restore: false });
    expect(await actions({ can_manage_archive: false })).toEqual({ archive: false, restore: false });
  });

  it("keeps session archival distinct from student archival and out of the bearer capabilities", async () => {
    state.result = { data: detail({ archived_at: "2030-01-02T09:00:00Z", archived_by_name: "Admin", archive_note: "Wrong class" }), error: null };
    const result = await getSession(ACADEMY, SESSION);
    if (!result.ok) throw new Error("expected a session");
    expect(result.data).toMatchObject({
      sessionArchivedAt: "2030-01-02T09:00:00Z", archiveNote: "Wrong class",
      archiveImpact: { rosterCount: 4, officialCount: 2, draftCount: 1, pendingEffects: 1 },
    });
    const wire = sessionV1(result.data) as Record<string, unknown>;
    expect(wire).toMatchObject({ session_archived_at: "2030-01-02T09:00:00Z", archive_note: "Wrong class", roster_count: 0 });
    for (const key of ["roster", "archive_events", "archive_impact", "permitted_actions", "year_open"]) expect(wire).not.toHaveProperty(key);
  });
});
