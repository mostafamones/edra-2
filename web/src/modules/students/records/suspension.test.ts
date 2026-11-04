import { beforeEach, describe, expect, it, vi } from "vitest";
import { throughTransport } from "@/modules/transport.test-support";

vi.mock("@tanstack/react-start/server-only", () => ({}));
const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("./data", () => ({ staffContext: mocks.context }));

import { previewStudentSuspension, setStudentSuspension } from "./suspension.server";

const ACADEMY = "11111111-1111-4111-8111-111111111111";
const R1 = "22222222-2222-4222-8222-222222222222";
const R2 = "33333333-3333-4333-8333-333333333333";
const actor = (role: string, rpc = vi.fn()) => { mocks.context.mockResolvedValue({ db: { rpc }, userId: "u", role }); return rpc; };

describe("student suspension commands", () => {
  beforeEach(() => mocks.context.mockReset());

  it("leaves Instructors and non-members without the commands, before any write", async () => {
    for (const role of ["instructor", null]) {
      const rpc = role ? actor(role) : (mocks.context.mockResolvedValue(null), vi.fn());
      expect(await setStudentSuspension({ academyId: ACADEMY, records: [{ id: R1, revision: 0 }], suspended: true, reason: null })).toMatchObject({ ok: false, code: "forbidden" });
      expect(await previewStudentSuspension({ academyId: ACADEMY, recordIds: [R1] })).toMatchObject({ ok: false, code: "forbidden" });
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it("sends one trimmed reason, blank as null, and the actor never comes from the client", async () => {
    const rpc = actor("head_admin", vi.fn().mockResolvedValue({ data: { changed: [], unchanged: [] }, error: null }));
    await setStudentSuspension({ academyId: ACADEMY, records: [{ id: R1.toUpperCase(), revision: 2 }], suspended: false, reason: "  Paid  ", actorId: "spoofed" });
    expect(rpc).toHaveBeenLastCalledWith("set_student_access_suspension", { p_academy_id: ACADEMY, p_records: [{ id: R1, revision: 2 }], p_suspended: false, p_reason: "Paid" });
    await setStudentSuspension({ academyId: ACADEMY, records: [{ id: R1, revision: 2 }], suspended: true, reason: "   " });
    expect(rpc.mock.lastCall?.[1].p_reason).toBeNull();
  });

  it("rejects invalid input before reaching the database", async () => {
    const rpc = actor("owner");
    for (const value of [
      { academyId: ACADEMY, records: [], suspended: true },
      { academyId: ACADEMY, records: Array.from({ length: 501 }, () => ({ id: R1, revision: 0 })), suspended: true },
      { academyId: ACADEMY, records: [{ id: R1, revision: -1 }], suspended: true },
      { academyId: ACADEMY, records: [{ id: R1, revision: 0 }], suspended: true, reason: "x".repeat(501) },
      { academyId: "nope", records: [{ id: R1, revision: 0 }], suspended: true },
    ]) expect(await setStudentSuspension(value)).toMatchObject({ ok: false, code: "validation" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports the authoritative changed and unchanged results, through transport", async () => {
    actor("admin", vi.fn().mockResolvedValue({ data: {
      changed: [{ record_id: R1, profile_id: "p1", revision: 3 }], unchanged: [{ record_id: R2, profile_id: "p2", revision: 1 }],
    }, error: null }));
    const result = await setStudentSuspension({ academyId: ACADEMY, records: [{ id: R1, revision: 2 }, { id: R2, revision: 1 }], suspended: true, reason: null });
    expect(result).toEqual({ ok: true, data: { changed: [{ recordId: R1, profileId: "p1", revision: 3 }], unchanged: [{ recordId: R2, profileId: "p2", revision: 1 }] } });
    expect(await throughTransport(result)).toEqual(result);
  });

  it("maps stale and missing targets to whole-batch failures", async () => {
    for (const code of ["stale_suspension", "not_found", "forbidden"]) {
      actor("admin", vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: code } }));
      expect(await setStudentSuspension({ academyId: ACADEMY, records: [{ id: R1, revision: 0 }], suspended: true })).toMatchObject({ ok: false, code });
    }
  });

  it("previews fresh state for deduplicated ids", async () => {
    const rpc = actor("admin", vi.fn().mockResolvedValue({ data: [{
      record_id: R1, profile_id: "p1", full_name: "Amal", archived: true, year_closed: true, connected: false, suspended: true, revision: 4,
    }], error: null }));
    const result = await previewStudentSuspension({ academyId: ACADEMY, recordIds: [R1, R1.toUpperCase(), R2] });
    expect(rpc).toHaveBeenCalledWith("preview_student_access_suspension", { p_academy_id: ACADEMY, p_record_ids: [R1, R2] });
    expect(result).toEqual({ ok: true, data: [{ recordId: R1, profileId: "p1", fullName: "Amal", archived: true, yearClosed: true, connected: false, suspended: true, revision: 4 }] });
  });
});
