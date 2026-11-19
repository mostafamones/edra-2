import { afterEach, expect, it, vi } from "vitest";
import { academyMember } from "@/lib/supabase/membership";
import { reviewPageOnServer } from "./review.server";
import { GeminiReviewError, inspectQuestionPages } from "./gemini";

vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@/lib/supabase/membership", () => ({ academyMember: vi.fn() }));
vi.mock("./gemini", async importOriginal => ({ ...await importOriginal<typeof import("./gemini")>(), inspectQuestionPages: vi.fn() }));

const academyId = "a0000000-0000-4000-8000-000000000001";
const input = { academyId, pages: [{ number: 1, text: "This page is a worked example." }] };
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

it("bounds previous-page context, requires adjacency, and authorizes context-only scans", async () => {
  vi.stubEnv("GEMINI_API_KEY", "development-key");
  expect(await reviewPageOnServer({ academyId, pages: [], previousPage: { number: 21, text: "Solve each pair." } }))
    .toEqual({ ok: false, code: "input" });
  for (const previousPage of [{ number: 3, text: "Wrong page" }, { number: 1, text: "x".repeat(12001) }]) {
    expect(await reviewPageOnServer({ ...input, pages: [{ number: 2, text: "12. x+y=7" }], previousPage })).toEqual({ ok: false, code: "input" });
  }
  expect(academyMember).not.toHaveBeenCalled();
  vi.mocked(academyMember).mockResolvedValue(null);
  expect(await reviewPageOnServer({ academyId, pages: [{ number: 21, image: "/9j/A=", scan: true }], transcriptionOnly: true })).toEqual({ ok: false, code: "denied" });
  expect(await reviewPageOnServer({ academyId, pages: [{ number: 22, text: "12. x+y=7" }], previousPage: { number: 21, text: "Solve each pair." } })).toEqual({ ok: false, code: "denied" });
  expect(inspectQuestionPages).not.toHaveBeenCalled();
});

it("returns an authorized successful transcription even when drafting times out", async () => {
  vi.stubEnv("GEMINI_API_KEY", "development-key");
  vi.mocked(academyMember).mockResolvedValue({ role: "admin" } as Awaited<ReturnType<typeof academyMember>>);
  const transcription = { transcript: "Practice exercise", exercises: ["1. Find x"] };
  vi.mocked(inspectQuestionPages).mockImplementationOnce(async (...args) => {
    args[5]?.(transcription);
    throw new GeminiReviewError("timeout", "drafts");
  });
  expect(await reviewPageOnServer({ academyId, pages: [{ number: 1, image: "/9j/A=", scan: true }] }))
    .toEqual({ ok: false, code: "timeout", stage: "drafts", transcription });
});

it("does not bypass manager authorization when a browser supplies cached scan text", async () => {
  vi.stubEnv("GEMINI_API_KEY", "development-key");
  vi.mocked(academyMember).mockResolvedValue(null);
  expect(await reviewPageOnServer({ academyId, pages: [{ number: 1, transcription: { transcript: "Practice", exercises: [] } }] }))
    .toEqual({ ok: false, code: "denied" });
  expect(inspectQuestionPages).not.toHaveBeenCalled();
});

it("never sends a page for a caller without active manager authority in the specified academy", async () => {
  vi.stubEnv("GEMINI_API_KEY", "development-key");
  vi.mocked(academyMember).mockResolvedValueOnce(null).mockResolvedValueOnce({ role: "instructor" } as Awaited<ReturnType<typeof academyMember>>);
  expect(await reviewPageOnServer(input)).toEqual({ ok: false, code: "denied" });
  expect(await reviewPageOnServer(input)).toEqual({ ok: false, code: "denied" });
  expect(academyMember).toHaveBeenCalledWith(academyId);
  expect(inspectQuestionPages).not.toHaveBeenCalled();
});

it("sends only validated pages without academy identity, and refuses production", async () => {
  vi.stubEnv("GEMINI_API_KEY", " development-key ");
  vi.mocked(academyMember).mockResolvedValue({ role: "admin" } as Awaited<ReturnType<typeof academyMember>>);
  vi.mocked(inspectQuestionPages).mockResolvedValue({ pages: [{ number: 1, kind: "reference", note: "", needsImage: false, questions: [] }] });
  expect(await reviewPageOnServer({ ...input, pages: [{ number: 1, text: "Question?", image: "/9j/A=" }] })).toEqual({ ok: false, code: "input" });
  expect(await reviewPageOnServer(input)).toMatchObject({ ok: true });
  expect(inspectQuestionPages).toHaveBeenCalledExactlyOnceWith(input.pages, "development-key");
  vi.stubEnv("NODE_ENV", "production");
  expect(await reviewPageOnServer(input)).toEqual({ ok: false, code: "unavailable" });
  expect(inspectQuestionPages).toHaveBeenCalledTimes(1);
});

it("reports an unavailable development server when the Gemini key is missing", async () => {
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.mocked(academyMember).mockResolvedValue({ role: "admin" } as Awaited<ReturnType<typeof academyMember>>);
  expect(await reviewPageOnServer(input)).toEqual({ ok: false, code: "unavailable" });
  expect(inspectQuestionPages).not.toHaveBeenCalled();
});

it("bounds embedded image text before authorization and forwards only the authorized source page", async () => {
  vi.stubEnv("GEMINI_API_KEY", "development-key");
  const page = { number: 2, image: "/9j/A=", sourceText: "g. A continuation item from the original PDF." };
  expect(await reviewPageOnServer({ academyId, pages: [{ ...page, sourceText: "x".repeat(8001) }] })).toEqual({ ok: false, code: "input" });
  expect(academyMember).not.toHaveBeenCalled();
  expect(inspectQuestionPages).not.toHaveBeenCalled();
  vi.mocked(academyMember).mockResolvedValue({ role: "admin" } as Awaited<ReturnType<typeof academyMember>>);
  vi.mocked(inspectQuestionPages).mockResolvedValue({ pages: [{ number: 2, kind: "reference", note: "", needsImage: false, questions: [] }] });
  expect(await reviewPageOnServer({ academyId, pages: [page] })).toMatchObject({ ok: true });
  expect(academyMember).toHaveBeenCalledExactlyOnceWith(academyId);
  expect(inspectQuestionPages).toHaveBeenCalledExactlyOnceWith([page], "development-key");
});
