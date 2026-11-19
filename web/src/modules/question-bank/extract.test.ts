import { afterEach, expect, it, vi } from "vitest";
import { extractWithGemini, planExtraction, ScanResultCache } from "./extract";
import { assessSuggestedCrop, cropSource, fitPageImage, sourceDataUrl } from "./evidence";
import type { SourcePage } from "./parser";
import { reviewQuestionPage } from "./review";
import { pageImageLimit, pageReviewInput } from "./review-contract";

vi.mock("./review", () => ({ reviewQuestionPage: vi.fn() }));
vi.mock("./evidence", () => ({ sourceDataUrl: vi.fn(async () => "data:image/jpeg;base64,/9j/4A=="), cropSource: vi.fn(), fitPageImage: vi.fn(), assessSuggestedCrop: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it("reads an out-of-range scan only for context and carries its header without importing its questions", async () => {
  vi.mocked(sourceDataUrl).mockResolvedValue("data:image/jpeg;base64,/9j/4A==");
  const cache = new ScanResultCache();
  const preceding = { number: 21, mode: "scan" as const, text: "", image: new Blob(["previous"]) };
  const current = { number: 22, mode: "scan" as const, text: "", image: new Blob(["target"]) };
  const previousTranscript = { transcript: "2. Solve each pair of equations. Items 1 through 11.", exercises: ["11. x + y = 5, x - y = 1"] };
  const targetTranscript = { transcript: "12. x + y = 7, x - y = 3", exercises: ["12. x + y = 7, x - y = 3"] };
  const reviewed = { number: 22, kind: "questions" as const, note: "", needsImage: false, questions: [{
    number: "2.12", section: null, prompt: "Solve each pair of equations. x + y = 7, x - y = 3", choices: [], check: "", continuationPages: [], visuals: [],
  }] };
  vi.mocked(reviewQuestionPage).mockResolvedValueOnce({ ok: true, transcription: previousTranscript, review: { pages: [{ number: 21, kind: "reference", note: "", needsImage: false, questions: [] }] } })
    .mockResolvedValueOnce({ ok: true, transcription: targetTranscript, review: { pages: [reviewed] } });
  const result = await extractWithGemini("academy", [current], new AbortController().signal, () => {}, cache, [preceding]);
  expect(vi.mocked(reviewQuestionPage).mock.calls[0][0]?.data).toMatchObject({ transcriptionOnly: true, pages: [{ number: 21, scan: true }] });
  expect(vi.mocked(reviewQuestionPage).mock.calls[1][0]?.data).toMatchObject({ pages: [{ number: 22 }], previousPage: { number: 21, text: previousTranscript.transcript } });
  expect(result.questions.map(q => [q.page, q.number])).toEqual([[22, "2.12"]]);
  await extractWithGemini("academy", [current], new AbortController().signal, () => {}, cache, [preceding]);
  expect(reviewQuestionPage).toHaveBeenCalledTimes(2);
  expect(cache.get(22, "different previous-page text")).toBeUndefined();
});

it("carries an adjacent scan transcript to the next page even after its draft pass fails", async () => {
  vi.mocked(sourceDataUrl).mockResolvedValue("data:image/jpeg;base64,/9j/4A==");
  const transcription = { transcript: "Solve each pair over the real numbers. 11. x + y = 2", exercises: ["11. x + y = 2"] };
  vi.mocked(reviewQuestionPage).mockResolvedValueOnce({ ok: false, code: "timeout", stage: "drafts", transcription })
    .mockResolvedValueOnce({ ok: true, review: { pages: [{ number: 22, kind: "reference", note: "", needsImage: false, questions: [] }] } });
  await extractWithGemini("academy", [21, 22].map(number => ({ number, mode: "scan", text: "", image: new Blob(["scan"]) })), new AbortController().signal, () => {});
  expect(vi.mocked(reviewQuestionPage).mock.calls[1][0]?.data).toMatchObject({ previousPage: { number: 21, text: transcription.transcript } });
  expect(reviewQuestionPage).toHaveBeenCalledTimes(2);
});

it("keeps target exercises and flags the context gap when the previous scan cannot be transcribed", async () => {
  vi.mocked(sourceDataUrl).mockResolvedValue("data:image/jpeg;base64,/9j/4A==");
  vi.mocked(reviewQuestionPage).mockResolvedValueOnce({ ok: false, code: "invalid", stage: "scan" })
    .mockResolvedValueOnce({ ok: true, review: { pages: [{ number: 22, kind: "questions", note: "", needsImage: false, questions: [{
      number: "12", section: null, prompt: "x+y=7, x-y=3", choices: [], check: "Missing instruction", continuationPages: [], visuals: [],
    }] }] } });
  const page = (number: number): SourcePage => ({ number, mode: "scan", text: "", image: new Blob(["scan"]) });
  const result = await extractWithGemini("academy", [page(22)], new AbortController().signal, () => {}, new ScanResultCache(), [page(21)]);
  expect(result.questions).toHaveLength(1);
  expect(result.questions[0].issues).toContain("Previous-page context could not be read. Check the instruction for continuation exercises.");
  expect(result.failedPages).toBeUndefined();
  expect(vi.mocked(reviewQuestionPage).mock.calls[1][0]?.data).not.toHaveProperty("previousPage");
});

it("reuses a successful transcription after draft failure without resending the scan", async () => {
  const transcription = { transcript: String.raw`أوجد \(\frac{١}{٢}\)`, exercises: ["1. Exercise"] };
  const cache = new ScanResultCache();
  const pages: SourcePage[] = [{ number: 1, image: new Blob(["scan"], { type: "image/jpeg" }), mode: "scan", text: "" }];
  vi.mocked(sourceDataUrl).mockResolvedValue("data:image/jpeg;base64,/9j/4A==");
  vi.mocked(reviewQuestionPage).mockResolvedValueOnce({ ok: false, code: "timeout", stage: "drafts", transcription })
    .mockResolvedValueOnce({ ok: true, review: { pages: [{ number: 1, kind: "reference", note: "", needsImage: false, questions: [] }] } });
  await extractWithGemini("academy", pages, new AbortController().signal, () => {}, cache);
  await extractWithGemini("academy", pages, new AbortController().signal, () => {}, cache);
  expect(vi.mocked(reviewQuestionPage).mock.calls[1][0]?.data).toMatchObject({ pages: [{ number: 1, transcription }] });
  expect(sourceDataUrl).toHaveBeenCalledOnce();
});

it("withholds a potentially clipped suggested figure and keeps actionable source feedback", async () => {
  const bounds = { left: 0.2, top: 0.2, right: 0.8, bottom: 0.6 };
  vi.mocked(sourceDataUrl).mockResolvedValue("data:image/jpeg;base64,/9j/4A==");
  vi.mocked(cropSource).mockResolvedValue(new Blob(["crop"]));
  vi.mocked(assessSuggestedCrop).mockResolvedValue("Suggested crop may be clipped. Crop the full figure from the original page.");
  vi.mocked(reviewQuestionPage).mockResolvedValueOnce({ ok: true, review: { pages: [{
    number: 1, kind: "questions", note: "", needsImage: false, questions: [{
      number: "1", section: null, prompt: "Use the diagram.", choices: [], continuationPages: [], check: "", visuals: [{ description: "Diagram", bounds }],
    }],
  }] } });
  const result = await extractWithGemini("academy", [{ number: 1, image: new Blob(["page"]), text: "", mode: "text" }], new AbortController().signal, () => {});
  expect(result.visuals).toEqual({});
  expect(result.questions[0].issues).toContain("Suggested crop may be clipped. Crop the full figure from the original page.");
});

it("uses a unique source highlight when Gemini misses it and flags disagreement", async () => {
  const text = "3. What is the big-O of this code?";
  const choices = ["O(n³)", "O(n²)", "O(n⁵)", "O(n)"].map((value, i) => ({ key: "abcd"[i], text: value }));
  const question = { number: "3", section: null, prompt: text, choices, check: "", continuationPages: [], visuals: [] };
  const extract = (markedChoiceKey: string | null) => {
    vi.mocked(reviewQuestionPage).mockResolvedValueOnce({ ok: true, review: { pages: [
      { number: 1, kind: "questions", note: "", needsImage: false, questions: [{ ...question, markedChoiceKey }] },
    ] } });
    return extractWithGemini("academy", [{ number: 1, mode: "text", text, markedChoices: [
      { choices: choices.map(choice => ({ ...choice, key: choice.key.toUpperCase() })), markedKeys: ["A"] },
    ] }], new AbortController().signal, () => {});
  };
  expect((await extract(null)).questions[0].answer).toEqual({ key: "a", page: 1, source: "book", marked: true });
  const { questions: [conflict] } = await extract("b");
  expect(conflict.answer).toBeUndefined();
  expect(conflict.issues).toContain("Check the marked choices against the original page");
  expect(reviewQuestionPage).toHaveBeenCalledTimes(2);
});

it("routes Arabic visuals and scans to vision even if the PDF contains misleading embedded text", () => {
  expect(planExtraction([
    { number: 1, mode: "text", text: "1. Write an explanation of the law." },
    { number: 2, mode: "text", text: "1. أوجد المساحة في الشكل المقابل." },
    { number: 3, mode: "scan", text: "This could be an inaccurate text layer." },
    { number: 4, mode: "text", text: "" },
  ]).map(batch => batch.mode)).toEqual(["text", "image", "image", "image"]);
});

it("flags blank renders without spending Gemini quota or offering a retry on the same blank pixels", async () => {
  const result = await extractWithGemini("academy", [{
    number: 9, mode: "scan", text: "", blankImage: true,
  }], new AbortController().signal, () => {});
  expect(reviewQuestionPage).not.toHaveBeenCalled();
  expect(result.failedPages).toBeUndefined();
  expect(result.issues).toEqual([expect.objectContaining({ page: 9, reason: expect.stringContaining("rendered blank"), retryable: false })]);
});

it("reuses complete scans but sends uncertain scans again and keeps separate file caches", async () => {
  const image = new Blob(["scan"], { type: "image/jpeg" });
  vi.mocked(sourceDataUrl).mockResolvedValue("data:image/jpeg;base64,/9j/4A==");
  const pages: SourcePage[] = [9, 10].map(number => ({ number, image, mode: "scan", text: "" }));
  const cache = new ScanResultCache();
  vi.mocked(reviewQuestionPage).mockImplementation(async args => {
    const number = pageReviewInput.parse(args?.data).pages[0].number;
    return { ok: true, transcription: { transcript: `Practice page ${number}`, exercises: [] }, review: { pages: [{
      number, kind: "reference", note: number === 10 ? "Check for an exercise below the figure" : "",
      needsImage: false, needsPageReview: number === 10, questions: [],
    }] } };
  });
  const extract = (scope: ScanResultCache) => extractWithGemini("a0000000-0000-4000-8000-000000000001", pages, new AbortController().signal, () => {}, scope);
  await extract(cache);
  await extract(cache);
  await extract(new ScanResultCache());
  expect(vi.mocked(reviewQuestionPage).mock.calls.map(([args]) => pageReviewInput.parse(args?.data).pages[0].number))
    .toEqual([9, 10, 10, 9, 10]);
});

it("sends a fitted scan without replacing the original review image", async () => {
  const original = new Blob([new Uint8Array(pageImageLimit + 1)], { type: "image/jpeg" });
  const fitted = new Blob(["fitted"], { type: "image/jpeg" });
  vi.mocked(fitPageImage).mockResolvedValueOnce(fitted);
  vi.mocked(sourceDataUrl).mockResolvedValueOnce("data:image/jpeg;base64,/9j/4A==");
  vi.mocked(reviewQuestionPage).mockResolvedValueOnce({ ok: true, review: { pages: [
    { number: 9, kind: "reference", note: "", needsImage: false, questions: [] },
  ] } });
  const source: SourcePage = { number: 9, image: original, mode: "scan", text: "" };
  await extractWithGemini("academy", [source], new AbortController().signal, () => {});
  expect(fitPageImage).toHaveBeenCalledWith(original, pageImageLimit);
  expect(sourceDataUrl).toHaveBeenCalledWith(fitted);
  expect(source.image).toBe(original);
  expect(reviewQuestionPage).toHaveBeenCalledOnce();
});

it("recovers an invalid image response from embedded text and marks visual evidence for review", async () => {
  const text = "Question (2): Write a function that reverses a queue.";
  vi.mocked(reviewQuestionPage).mockResolvedValueOnce({ ok: false, code: "invalid" }).mockResolvedValueOnce({
    ok: true, review: { pages: [{ number: 1, kind: "questions", note: "", needsImage: true, questions: [{
      number: "2", section: null, prompt: text, choices: [], check: "", continuationPages: [], visuals: [],
    }] }] },
  });
  const result = await extractWithGemini("academy", [
    { number: 1, mode: "text", text, preferImage: true, image: new Blob([], { type: "image/jpeg" }) },
  ], new AbortController().signal, () => {});
  expect(reviewQuestionPage).toHaveBeenCalledTimes(2);
  expect(vi.mocked(reviewQuestionPage).mock.calls[1][0]?.data).toEqual({ academyId: "academy", pages: [{ number: 1, text }] });
  expect(result.questions[0].issues).toContain("Check figures and layout against the original page");
  expect(result.issues[0].reason).toContain("Recovered from PDF text");
});

it("keeps the failure reason and source page when Gemini returns no usable results", async () => {
  vi.mocked(reviewQuestionPage).mockResolvedValueOnce({ ok: false, code: "provider" });
  const result = await extractWithGemini("academy", [
    { number: 1, mode: "text", text: "Question (2): Write a function that reverses a queue." },
  ], new AbortController().signal, () => {});
  expect(result.questions).toEqual([]);
  expect(result.issues).toEqual([expect.objectContaining({ page: 1, reason: "Gemini didn’t respond; page not extracted" })]);
});

it("ignores extraction notes unless there is unresolved page work", async () => {
  const text = "Question 2.A: Reverse the queue using the given declarations.";
  const question = { number: "2.A", section: null, prompt: text, choices: [], check: "", continuationPages: [], visuals: [] };
  vi.mocked(reviewQuestionPage).mockResolvedValueOnce({ ok: true, review: { pages: [
    { number: 1, kind: "questions", note: "The solution was omitted and declarations kept.", needsImage: false, needsPageReview: false, questions: [question] },
    { number: 2, kind: "questions", note: "Check the missing continuation.", needsImage: false, needsPageReview: true, questions: [question] },
  ] } });
  const result = await extractWithGemini("academy", [
    { number: 1, mode: "text", text },
    { number: 2, mode: "text", text },
  ], new AbortController().signal, () => {});
  expect(result.questions).toHaveLength(2);
  expect(result.issues).toEqual([expect.objectContaining({ page: 2, reason: "Check the missing continuation." })]);
});

it("tries an unexpected visual once, then surfaces quota without sending the remaining pages", async () => {
  const pageImage = new Blob([], { type: "image/jpeg" });
  vi.mocked(reviewQuestionPage).mockResolvedValueOnce({ ok: true, review: { pages: [{
    number: 1, kind: "questions", note: "", needsImage: true, questions: [{
      number: "1", section: null, prompt: "Use the source above to find the length.", choices: [], check: "", continuationPages: [], visuals: [],
    }],
  }] } }).mockResolvedValueOnce({ ok: false, code: "quota" });
  const result = await extractWithGemini("academy", [
    { number: 1, mode: "text", text: "Practice: 1. Use the source above to find the length.", image: pageImage },
    { number: 2, mode: "text", text: "", image: pageImage },
  ], new AbortController().signal, () => {});
  expect(reviewQuestionPage).toHaveBeenCalledTimes(2);
  expect(vi.mocked(reviewQuestionPage).mock.calls[1][0]?.data).toEqual({ academyId: "academy", pages: [{ number: 1, image: "/9j/4A==", sourceText: "Practice: 1. Use the source above to find the length." }] });
  expect(result.questions[0].issues).toContain("Check the original page");
  expect(result.issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ page: 1, reason: expect.stringContaining("image check incomplete") }),
    expect.objectContaining({ page: 2, reason: expect.stringContaining("page not extracted") }),
  ]));
});
