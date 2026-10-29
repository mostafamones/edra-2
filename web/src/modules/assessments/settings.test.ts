import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ member: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/membership", () => ({ academyMember: mocks.member }));

import { saveQuiz } from "@/modules/quizzes";
import { saveExam } from "@/modules/exams";

const academyId = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const draft = { title: "Settings", instructions: "", solutionNotes: "", audience: null, levelId: null, trackId: null, groupIds: [], timeLimitMinutes: null, parts: [] };
const availability = { opensAt: "2026-11-01T10:00:00Z", closesAt: "2026-11-01T11:00:00Z" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.member.mockResolvedValue({ db: { rpc: mocks.rpc } });
});

describe.each(["quiz", "exam"] as const)("%s settings action", (kind) => {
  const save = (window?: { opensAt: string | null; closesAt: string | null }) => kind === "quiz"
    ? saveQuiz({ academyId, quizId: id, expectedVersion: 7, draft, availability: window })
    : saveExam({ academyId, examId: id, expectedVersion: 7, draft, availability: window });

  it("uses one transactional RPC for combined edits and keeps the reviewed version", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: `${kind}_conflict` } });
    expect(await save(availability)).toMatchObject({ ok: false, code: `${kind}_conflict` });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(`save_${kind}_settings`, expect.objectContaining({
      p_academy_id: academyId, [`p_${kind}_id`]: id, p_expected_version: 7, p_opens_at: availability.opensAt, p_closes_at: availability.closesAt,
      p_draft: expect.objectContaining({ title: "Settings" }),
    }));
  });

  it("keeps the original preparation command when availability is unchanged", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: `${kind}_conflict` } });
    await save();
    expect(mocks.rpc).toHaveBeenCalledWith(`update_${kind}`, expect.any(Object));
  });

  it("rejects an incomplete or reversed availability window before sending it", async () => {
    expect(await save({ ...availability, closesAt: null })).toMatchObject({ ok: false, code: "validation" });
    expect(await save({ opensAt: availability.closesAt, closesAt: availability.opensAt })).toMatchObject({ ok: false, code: "validation" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires academy membership before either mutation", async () => {
    mocks.member.mockResolvedValue(null);
    expect(await save(availability)).toMatchObject({ ok: false, code: "forbidden" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
