import { beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY = "11111111-1111-4111-8111-111111111111";
const EXAM = "22222222-2222-4222-8222-222222222222";
const ACCOUNT = "33333333-3333-4333-8333-333333333333";
const PART = "44444444-4444-4444-8444-444444444444";
const WRITTEN = "55555555-5555-4555-8555-555555555555";
const Q1 = "66666666-6666-4666-8666-666666666666";
const Q2 = "77777777-7777-4777-8777-777777777777";
const RIGHT = "88888888-8888-4888-8888-888888888888";
const WRONG = "99999999-9999-4999-8999-999999999999";
const IMAGE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type Rpc = { data: unknown; error: { code?: string; message?: string; details?: string } | null };
const state = vi.hoisted(() => ({
  signedIn: true,
  response: { data: null, error: null } as Rpc,
  calls: [] as { name: string; args: unknown }[],
  signed: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/authority", () => ({
  cookieAuthority: async () => state.signedIn ? {
    userId: "student-1",
    db: { rpc: async (name: string, args: unknown) => { state.calls.push({ name, args }); return state.response; } },
  } : null,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => {
          state.signed.push(...paths);
          return { data: paths.map((path) => ({ signedUrl: `https://signed/${path}`, error: null })), error: null };
        },
      }),
    },
  }),
}));

const { getMyExamReview } = await import("./data");
const { signMyExamReviewImages } = await import("./images");

const base = { account_id: ACCOUNT, server_now: "2026-10-20T10:00:00Z" };
const available = {
  ...base,
  status: "available",
  source: "online",
  notes: "Read chapter 2",
  parts: [
    {
      id: PART, title: "Sheet", instructions: null, kind: "question_sheet",
      questions: [{
        id: Q1, number: 1, prompt: "Pick", excluded: false, max_score: "2.00", score: "2.00",
        choices: [{ id: RIGHT, label: "Right", is_correct: true }, { id: WRONG, label: "Wrong" }],
        answer: { state: "choice", choice_id: WRONG }, correct_choice_id: RIGHT, model_answer: "",
      }],
    },
    {
      id: WRITTEN, title: "Written", instructions: "Explain", kind: "written_work",
      questions: [{
        id: Q2, number: 2, prompt: "Why?", excluded: true, choices: [],
        answer: { state: "paper_work" }, correct_choice_id: null, model_answer: "Because",
      }],
    },
  ],
};

beforeEach(() => {
  state.signedIn = true;
  state.response = { data: null, error: null };
  state.calls = [];
  state.signed = [];
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
});

describe("student exam review boundary", () => {
  it("validates ids and the session before calling the database", async () => {
    expect(await getMyExamReview({ academyId: ACADEMY, examId: "../x" })).toMatchObject({ ok: false, code: "not_found" });
    state.signedIn = false;
    expect(await getMyExamReview({ academyId: ACADEMY, examId: EXAM })).toMatchObject({ ok: false, code: "forbidden" });
    expect(state.calls).toEqual([]);
  });

  it("calls the scoped review read without an editor token", async () => {
    state.response = { data: { ...base, status: "unavailable", reason: "awaiting_closure" }, error: null };
    const result = await getMyExamReview({ academyId: ACADEMY, examId: EXAM });
    expect(state.calls).toEqual([{ name: "get_my_exam_review", args: { p_academy_id: ACADEMY, p_exam_id: EXAM } }]);
    expect(result).toEqual({ ok: true, data: { status: "unavailable", accountId: ACCOUNT, serverNow: base.server_now, reason: "awaiting_closure" } });
  });

  it("never forwards material with an unavailable review", async () => {
    state.response = { data: { ...available, status: "unavailable", reason: "awaiting_result" }, error: null };
    const result = await getMyExamReview({ academyId: ACADEMY, examId: EXAM });
    expect(result.ok).toBe(true);
    const text = JSON.stringify(result);
    for (const leaked of ["parts", "Pick", "Right", "Because", "chapter", "choice"]) expect(text).not.toContain(leaked);
  });

  it("maps the qualified review and drops marks, maxima and keys flags", async () => {
    state.response = { data: available, error: null };
    const result = await getMyExamReview({ academyId: ACADEMY, examId: EXAM });
    expect(result).toMatchObject({
      ok: true,
      data: {
        status: "available", source: "online", notes: "Read chapter 2",
        parts: [
          { kind: "question_sheet", instructions: "", questions: [{ number: 1, answer: { state: "choice", choiceId: WRONG }, correctChoiceId: RIGHT }] },
          { kind: "written_work", questions: [{ number: 2, excluded: true, answer: { state: "paper_work" }, correctChoiceId: null, modelAnswer: "Because" }] },
        ],
      },
    });
    const text = JSON.stringify(result);
    for (const leaked of ["max_score", "maxScore", "score", "is_correct", "isCorrect"]) expect(text).not.toContain(leaked);
  });

  it("fails closed on an unexpected answer state or status", async () => {
    state.response = { data: { ...available, parts: [{ ...available.parts[0], questions: [{ ...available.parts[0].questions[0], answer: { state: "draft" } }] }] }, error: null };
    expect(await getMyExamReview({ academyId: ACADEMY, examId: EXAM })).toMatchObject({ ok: false, code: "unavailable" });
    state.response = { data: { ...base, status: "partial" }, error: null };
    expect(await getMyExamReview({ academyId: ACADEMY, examId: EXAM })).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("maps database refusals to student messages", async () => {
    state.response = { data: null, error: { code: "P0001", message: "student_link_unavailable" } };
    expect(await getMyExamReview({ academyId: ACADEMY, examId: EXAM })).toMatchObject({ ok: false, code: "student_link_unavailable" });
    state.response = { data: null, error: { code: "42501", message: "permission denied" } };
    expect(await getMyExamReview({ academyId: ACADEMY, examId: EXAM })).toMatchObject({ ok: false, code: "unavailable" });
  });
});

describe("student exam review images", () => {
  it("rejects malformed and oversized batches before authorization", async () => {
    expect(await signMyExamReviewImages({ academyId: ACADEMY, examId: EXAM, imageIds: [] })).toMatchObject({ ok: false, code: "validation" });
    expect(await signMyExamReviewImages({ academyId: ACADEMY, examId: EXAM, imageIds: Array(21).fill(IMAGE) })).toMatchObject({ ok: false, code: "validation" });
    expect(await signMyExamReviewImages({ academyId: ACADEMY, examId: EXAM, imageIds: ["../../other/file"] })).toMatchObject({ ok: false, code: "validation" });
    expect(state.calls).toEqual([]);
  });

  it("signs only database-authorized ids under the authorized academy", async () => {
    state.response = { data: { status: "ok", academy_id: ACADEMY, image_ids: [IMAGE] }, error: null };
    const result = await signMyExamReviewImages({ academyId: ACADEMY, examId: EXAM, imageIds: [IMAGE, IMAGE, RIGHT] });
    expect(state.calls).toEqual([{ name: "authorize_my_exam_review_images", args: { p_academy_id: ACADEMY, p_exam_id: EXAM, p_image_ids: [IMAGE, RIGHT] } }]);
    expect(state.signed).toEqual([`${ACADEMY}/${IMAGE}`]);
    expect(result).toEqual({ ok: true, kind: "urls", urls: { [IMAGE]: `https://signed/${ACADEMY}/${IMAGE}` }, expiresInSeconds: 60 });
  });

  it("signs nothing before qualification", async () => {
    state.response = { data: { status: "unavailable" }, error: null };
    expect(await signMyExamReviewImages({ academyId: ACADEMY, examId: EXAM, imageIds: [IMAGE] })).toEqual({ ok: true, kind: "unavailable" });
    expect(state.signed).toEqual([]);
  });
});
