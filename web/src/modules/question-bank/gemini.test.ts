import { readFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";
import { inspectQuestionPages } from "./gemini";
import { pageReviewInput, type PageReview } from "./review-contract";

const reference = { number: 1, kind: "reference", note: "", needsImage: false, questions: [] } as const;
const reply = <T extends { number: number }>(data: { pages: readonly T[] }) => Response.json({
  candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(Object.fromEntries(data.pages.map(page => [`page_${page.number}`, page]))) }] } }],
});

it("transcribes a context-only scan without spending a request extracting its exercises", async () => {
  const transcription = { transcript: "Solve each pair. 11. x+y=4", exercises: ["11. x+y=4"] };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(transcription) }] } }] }));
  const remember = vi.fn();
  const result = await inspectQuestionPages([{ number: 21, image: "/9j/A=", scan: true }], "secret", fetcher, [], false, remember, { transcriptionOnly: true });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(remember).toHaveBeenCalledWith(transcription);
  expect(result.pages[0].questions).toEqual([]);
});

it("supplies previous-page context to drafting while retaining only the requested physical page", async () => {
  const transcription = { transcript: "12. x+y=7, x-y=3\n3. New block: factor the following.\n1. x^2-4", exercises: ["12. x+y=7, x-y=3", "3.1. x^2-4"] };
  const previousPage = { number: 21, text: "2. Solve each equation pair over R × R.\n11. x+y=5, x-y=1" };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(reply({ pages: [
    { ...reference, number: 22, kind: "questions", questions: [
      { sourceExerciseId: 1, number: "2.12", section: null, prompt: "Solve each equation pair over R × R. x+y=7, x-y=3", choices: [], check: "" },
      { sourceExerciseId: 2, number: "3.1", section: null, prompt: "Factor the following. x^2-4", choices: [], check: "" },
    ] },
    { ...reference, number: 21 },
  ] }));
  const result = await inspectQuestionPages([{ number: 22, transcription }], "secret", fetcher, [], false, undefined, { previousPage });
  const request = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
  expect(JSON.stringify(request.contents)).toContain("BEGIN PREVIOUS PAGE CONTEXT ONLY: PHYSICAL PAGE 21");
  expect(JSON.stringify(request.systemInstruction)).toContain("stop carrying that instruction at a new heading");
  expect(result.pages.map(page => page.number)).toEqual([22]);
  expect(result.pages[0].questions.map(q => q.number)).toEqual(["2.12", "3.1"]);
});

it("rejects provider redirects without following them or forwarding the API key", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.redirect("https://example.invalid/"));
  await expect(inspectQuestionPages([{ number: 1, text: "An original practice exercise." }], "secret", fetcher))
    .rejects.toMatchObject({ code: "provider" });
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    expect.stringMatching(/^https:\/\/generativelanguage\.googleapis\.com\//),
    expect.objectContaining({ redirect: "manual" }),
  );
});

it("sends text without an image and rejects replies from the wrong source page", async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => reply({ pages: [reference] }));
  const text = [{ number: 1, text: "Explanation and worked examples." }];
  expect(await inspectQuestionPages(text, "secret", fetcher)).toEqual({ pages: [reference] });
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).contents[0].parts).toEqual([{ text: `BEGIN PHYSICAL PAGE 1 → page_1\n${text[0].text}\nEND PHYSICAL PAGE 1` }]);
  await expect(inspectQuestionPages([{ number: 2, text: "Find x." }], "secret", fetcher)).rejects.toMatchObject({ code: "invalid" });
});

it("sends the original page number when extracting the end of a long book", async () => {
  const input = pageReviewInput.parse({
    academyId: "a0000000-0000-4000-8000-000000000001",
    pages: [{ number: 600, text: "Question 600: Explain the final concept." }],
  });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply({ pages: [{ ...reference, number: 600 }] }));
  await expect(inspectQuestionPages(input.pages, "secret", fetcher)).resolves.toMatchObject({ pages: [{ number: 600 }] });
  const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
  expect(request.contents[0].parts[0].text).toContain("PHYSICAL PAGE 600 → page_600");
});

it("keeps valid exercises when another question and another page are malformed", async () => {
  const draft = { number: "1", section: null, choices: [], check: "", continuationPages: [], visuals: [] };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply({ pages: [
    { ...reference, number: 9, kind: "questions", questions: [
      { ...draft, prompt: "أوجد قيمة س." }, { ...draft, number: "2", prompt: "" },
    ] },
    { ...reference, number: 10, kind: "questions", questions: [] },
  ] }));
  const result = await inspectQuestionPages([{ number: 9, text: "Arabic math" }, { number: 10, text: "Next page" }], "secret", fetcher);
  expect(result.pages).toMatchObject([{
    number: 9, needsPageReview: true, note: expect.stringContaining("1 exercise"),
    questions: [{ number: "1", prompt: "أوجد قيمة س." }],
  }]);
});

it("reports a response that ran out of output tokens separately from invalid JSON", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ candidates: [{ finishReason: "MAX_TOKENS" }] }));
  await expect(inspectQuestionPages([{ number: 9, image: "/9j/A=" }], "secret", fetcher)).rejects.toMatchObject({ code: "truncated" });
});

it("transcribes a scan before extraction, retries a temporary provider failure, and flags an unmatched exercise", async () => {
  const draft = { number: "1", section: null, prompt: "أوجد قيمة س.", choices: [], check: "", continuationPages: [], visuals: [], sourceExerciseId: 1 };
  const transcript = { transcript: "تدريبات\n١. أوجد قيمة س.\n٢. أوجد قيمة ص.", exercises: ["أوجد قيمة س.", "أوجد قيمة ص."], visuals: [
    { exerciseId: 1, description: "Graph", bounds: { left: 100, top: 200, right: 300, bottom: 400 } },
  ] };
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(transcript) }] } }] }))
    .mockResolvedValueOnce(reply({ pages: [{ ...reference, number: 9, kind: "questions", questions: [draft] }] }))
    .mockRejectedValueOnce(new Error("Recovery connection failed"));
  const result = await inspectQuestionPages([{ number: 9, image: "/9j/A=", scan: true }], "secret", fetcher);
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(String(fetcher.mock.calls[0][0])).toContain("gemini-3.5-flash-lite");
  expect(String(fetcher.mock.calls[1][0])).toContain("gemini-3.1-flash-lite");
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).systemInstruction.parts[0].text).toContain("Transcribe the entire visible textbook page");
  const secondPass = JSON.parse(String(fetcher.mock.calls[2][1]?.body)).contents[0].parts;
  expect(secondPass).toEqual([{ text: expect.stringContaining("أوجد قيمة ص.") }]);
  expect(result.pages[0]).toMatchObject({
    needsPageReview: true, note: expect.stringContaining("1 possible exercise"),
    questions: [expect.objectContaining({ prompt: "أوجد قيمة س.", visuals: [
      { description: "Graph", bounds: { left: 0.1, top: 0.2, right: 0.3, bottom: 0.4 } },
    ] })],
  });
});

const scanReply = (count: number) => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({
  transcript: "Practice exercises", exercises: Array.from({ length: count }, (_, i) => `Exercise ${i + 1}`),
}) }] } }] });
const exercise = (id: number) => ({ sourceExerciseId: id, number: String(id), section: null,
  prompt: `Find the value for exercise ${id}.`, choices: [], check: "" });
const draftReply = (questions: unknown[]) => reply({ pages: [{ ...reference, kind: questions.length ? "questions" : "reference", questions }] });

it.each(["omitted", "empty", "malformed"])("recovers %s scan drafts once and restores source order", async mode => {
  const initial = mode === "empty" ? [] : [exercise(2), ...(mode === "malformed" ? [{ ...exercise(1), prompt: "" }] : [])];
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(scanReply(2))
    .mockResolvedValueOnce(draftReply(initial))
    .mockResolvedValueOnce(draftReply([exercise(1), exercise(2), exercise(59)]));
  const result = await inspectQuestionPages([{ number: 1, image: "/9j/A=", scan: true }], "secret", fetcher);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(result.pages[0].questions.map(q => q.sourceExerciseId)).toEqual([1, 2]);
  expect(result.pages[0].needsPageReview).not.toBe(true);
});

it("preserves a partial page without calling again after a drafts quota failure", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(scanReply(11))
    .mockResolvedValueOnce(draftReply([exercise(1)]))
    .mockResolvedValueOnce(new Response(null, { status: 429 }));
  const result = await inspectQuestionPages([{ number: 1, image: "/9j/A=", scan: true }], "secret", fetcher);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(result.pages[0].questions).toHaveLength(1);
  expect(result.pages[0]).toMatchObject({ needsPageReview: true, note: expect.stringContaining("10 possible exercises") });
});

it("keeps unresolved omissions visible when recovery returns malformed or repeated drafts", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(scanReply(3))
    .mockResolvedValueOnce(draftReply([exercise(3)]))
    .mockResolvedValueOnce(draftReply([exercise(1), exercise(1), { ...exercise(2), prompt: "" }]));
  const result = await inspectQuestionPages([{ number: 1, image: "/9j/A=", scan: true }], "secret", fetcher);
  expect(result.pages[0].questions.map(q => q.sourceExerciseId)).toEqual([1, 3]);
  expect(result.pages[0]).toMatchObject({ needsPageReview: true, note: expect.stringContaining("1 possible exercise") });
});

it("recovers an entirely omitted dense page in groups of at most ten candidates", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(scanReply(11))
    .mockResolvedValueOnce(draftReply([])).mockResolvedValueOnce(draftReply([]))
    .mockResolvedValueOnce(draftReply(Array.from({ length: 10 }, (_, i) => exercise(i + 1))))
    .mockResolvedValueOnce(draftReply([exercise(11)]));
  const result = await inspectQuestionPages([{ number: 1, image: "/9j/A=", scan: true }], "secret", fetcher);
  expect(result.pages[0].questions.map(q => q.sourceExerciseId)).toEqual(Array.from({ length: 11 }, (_, i) => i + 1));
  expect(fetcher).toHaveBeenCalledTimes(5);
});

it.each(["", "Check the missing shared instruction."])("clears recovered batch warnings while retaining source warnings: %s", async sourceNote => {
  const initial = { ...reference, kind: "questions", questions: Array.from({ length: 10 }, (_, i) => exercise(i + 1)),
    note: sourceNote, needsPageReview: !!sourceNote };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(scanReply(11))
    .mockResolvedValueOnce(reply({ pages: [initial] }))
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(draftReply([exercise(11)]));
  const { pages: [page] } = await inspectQuestionPages([{ number: 1, image: "/9j/A=", scan: true }], "secret", fetcher);
  expect(page.questions).toHaveLength(11);
  expect(page.note).toBe(sourceNote);
  expect(page.needsPageReview).toBe(!!sourceNote);
});

it.each([["2.1", "1", "2.1"], ["١", "2.1", "2.1"]])("retains complete scan/draft labels (%s, %s) without equation images", async (printed, draft, expected) => {
  const transcript = { transcript: "Practice: solve each pair.", exercises: [{
    excerpt: "2.1 x + y = 7; y = 2x + 1", number: printed, bounds: { left: 100, top: 200, right: 800, bottom: 300 },
  }] };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ candidates: [{
    finishReason: "STOP", content: { parts: [{ text: JSON.stringify(transcript) }] },
  }] })).mockResolvedValueOnce(draftReply([{ ...exercise(1), number: draft }]));
  const { pages: [page] } = await inspectQuestionPages([{ number: 1, image: "/9j/A=", scan: true }], "secret", fetcher);
  expect(page.questions[0]).toMatchObject({ number: expected, visuals: [] });
});

it("ignores obsolete expression crop proposals instead of attaching equation fragments", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ candidates: [{
    finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ transcript: "Practice: x + y = 7", exercises: [{
      excerpt: "x + y = 7", number: "1", bounds: { left: -1, top: 100, right: 600, bottom: 200 },
    }] }) }] },
  }] })).mockResolvedValueOnce(draftReply([exercise(1)]));
  const { pages: [page] } = await inspectQuestionPages([{ number: 1, image: "/9j/A=", scan: true }], "secret", fetcher);
  expect(page.questions).toHaveLength(1);
  expect(page.questions[0].visuals).toEqual([]);
  expect(page.needsPageReview).not.toBe(true);
});

it("drafts a cached LaTeX transcription without sending the image or flattening math", async () => {
  const prompt = String.raw`أوجد \(\frac{\text{س}}{٢} + \sqrt{٩}\)`;
  const transcription = { transcript: prompt, exercises: [{ excerpt: prompt, number: "1" }] };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(draftReply([{ ...exercise(1), prompt }]));
  const { pages: [page] } = await inspectQuestionPages([{ number: 1, transcription }], "secret", fetcher);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(page.questions[0]).toMatchObject({ prompt, visuals: [], check: "" });
  const parts = JSON.parse(String(fetcher.mock.calls[0][1]?.body)).contents[0].parts;
  expect(parts.every((part: Record<string, unknown>) => !part.inlineData)).toBe(true);
});

it("flags a damaged LaTeX escape instead of treating the equation as successfully rendered", async () => {
  const prompt = "أوجد \\(\frac{1}{2}\\)";
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(draftReply([{ ...exercise(1), prompt, continuationPages: [], visuals: [] }]));
  const { pages: [page] } = await inspectQuestionPages([{ number: 1, text: prompt }], "secret", fetcher);
  expect(page.questions[0].prompt).toBe(prompt);
  expect(page.questions[0].check).toContain("mathematical notation");
});

it.skipIf(!process.env.EDRA_GEMINI_CONTINUATION_IMAGE)("keeps continuation items and shared definitions on a real logic sheet", async () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Set GEMINI_API_KEY for the opt-in smoke test");
  const image = (await readFile(process.env.EDRA_GEMINI_CONTINUATION_IMAGE!)).toString("base64");
  const sourceText = await readFile(process.env.EDRA_GEMINI_CONTINUATION_IMAGE!.replace(/\.[^.]+$/, ".txt"), "utf8");
  const { pages: [page] } = await inspectQuestionPages([{ number: 2, image, sourceText }], key);
  expect(page.questions).toHaveLength(14);
  for (const label of ["g", "h", "i", "j"]) {
    const question = page.questions.find(q => q.number === label);
    expect(question?.check).toMatch(/context|instruction|parent|previous/i);
  }
  const translations = page.questions.filter(q => /3[.]/.test(q.number ?? ""));
  expect(translations).toHaveLength(10);
  expect(translations.every(q => q.prompt.includes("p") && q.prompt.includes("hot chocolate"))).toBe(true);
}, 150_000);

it("does not retry quota failures or extract without a completed scan transcription", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 429 }));
  await expect(inspectQuestionPages([{ number: 9, image: "/9j/A=", scan: true }], "secret", fetcher)).rejects.toMatchObject({ code: "quota" });
  expect(fetcher).toHaveBeenCalledOnce();
});

it("uses direct image extraction after both scan models are busy and flags the result for review", async () => {
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(reply({ pages: [{ ...reference, number: 23 }] }));
  const result = await inspectQuestionPages([{ number: 23, image: "/9j/A=", scan: true }], "secret", fetcher);
  expect(String(fetcher.mock.calls[2][0])).toContain("gemini-3.5-flash:generateContent");
  expect(result.pages[0]).toMatchObject({ needsPageReview: true, note: expect.stringContaining("Direct image extraction") });
});

it("splits a dense scan, preserves its completed questions, and applies the printed shared instruction", async () => {
  const transcript = { transcript: "حلّل المقادير الآتية", exercises: Array.from({ length: 11 }, (_, i) => `Exercise ${i + 1}`),
    visuals: [], sharedInstructions: [{ text: "حلّل المقادير الآتية :", exerciseIds: [1, 2, 3] }] };
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(transcript) }] } }] }))
    .mockResolvedValueOnce(reply({ pages: [{ ...reference, number: 7, kind: "questions", questions: [
      { number: "1", sourceExerciseId: 1, section: null, prompt: "س٢ − ٤", choices: [], check: "" },
      { number: "2", sourceExerciseId: 2, section: null, prompt: "حلّل المقادير الآتية: ص^(٢) + ٣", choices: [], check: "" },
      { number: "11", sourceExerciseId: 11, section: null, prompt: "Wrong batch", choices: [], check: "" },
    ] }] }))
    .mockResolvedValueOnce(new Response(null, { status: 429 }));
  const result = await inspectQuestionPages([{ number: 7, image: "/9j/A=", scan: true }], "secret", fetcher);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(result.pages[0].questions.map(q => q.prompt)).toEqual(["حلّل المقادير الآتية :\nس٢ − ٤", "حلّل المقادير الآتية :\nص^(٢) + ٣"]);
  expect(result.pages[0].questions[0].check).toContain("raised exponent");
  expect(result.pages[0]).toMatchObject({ needsPageReview: true, note: expect.stringContaining("11–11") });
});

it("rejects out-of-bounds crops and surfaces quota separately", async () => {
  const invalid: PageReview = { pages: [{ ...reference, kind: "questions", questions: [{
    number: "1", section: null, prompt: "Use the figure.", check: "", choices: [], continuationPages: [],
    visuals: [{ description: "Figure", bounds: { left: -0.2, right: 0.8, top: 0.1, bottom: 0.9 } }],
  }] }] };
  const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(async () => reply(invalid))
    .mockImplementationOnce(async () => new Response(null, { status: 429 }));
  const image = [{ number: 1, image: "/9j/A=" }];
  await expect(inspectQuestionPages(image, "secret", fetcher)).rejects.toMatchObject({ code: "invalid" });
  await expect(inspectQuestionPages(image, "secret", fetcher)).rejects.toMatchObject({ code: "quota" });
});

it("keeps separate visual boxes tight and drops standalone page counts, not questions about them", async () => {
  const draft = { number: "2.A", section: null, choices: [], check: "", continuationPages: [], visuals: [] };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply({ pages: [{
    ...reference, kind: "questions", questions: [
      { ...draft, number: null, prompt: "12 pages" },
      { ...draft, number: null, prompt: "عدد الصفحات: ١٢" },
      { ...draft, prompt: "How many pages fit into each of the two trays shown?", visuals: [
        { description: "Tray A", bounds: { left: 120, top: 250, right: 300, bottom: 390 } },
        { description: "Tray B", bounds: { left: 650, top: 240, right: 850, bottom: 395 } },
      ] },
    ],
  }] } satisfies PageReview));
  const result = await inspectQuestionPages([{ number: 1, image: "/9j/A=" }], "secret", fetcher);
  expect(result.pages[0].questions).toMatchObject([{
    number: "2.A", prompt: "How many pages fit into each of the two trays shown?", visuals: [
      { description: "Tray A", bounds: { left: 0.12, top: 0.25, right: 0.3, bottom: 0.39 } },
      { description: "Tray B", bounds: { left: 0.65, top: 0.24, right: 0.85, bottom: 0.395 } },
    ],
  }]);
});

it.each([false, true])("converts Gemini's native top/left/bottom/right coordinates once (scan=%s)", async scan => {
  const visual = { description: "Graph", box_2d: [250, 120, 390, 300] };
  const fetcher = vi.fn<typeof fetch>();
  if (scan) fetcher.mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({
    transcript: "Use the graph.", exercises: ["1. Use the graph."], visuals: [{ ...visual, exerciseId: 1 }],
  }) }] } }] }));
  fetcher.mockResolvedValueOnce(draftReply([{ ...exercise(1), continuationPages: [], visuals: scan ? [] : [visual] }]));
  const input = scan ? { number: 1, image: "/9j/A=", scan: true as const } : { number: 1, image: "/9j/A=" };
  const { pages: [page] } = await inspectQuestionPages([input], "secret", fetcher);
  expect(page.questions[0].visuals).toEqual([{ description: "Graph", bounds: { left: 0.12, top: 0.25, right: 0.3, bottom: 0.39 } }]);
});

// Run manually against a synthetic page with a question that references a printed figure.
it.skipIf(!process.env.EDRA_GEMINI_SMOKE_IMAGE)("extracts real text and visual exercises using the live Gemini contract", async () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Set GEMINI_API_KEY for the opt-in smoke test");
  const fetchSynthetic: typeof fetch = async (url, options) => {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`Gemini synthetic test HTTP ${response.status}: ${await response.text()}`);
    return response;
  };
  const text = await inspectQuestionPages([
    { number: 1, text: "Adding fractions. Worked Example 1: What is 1/2 + 1/2? Solution: It is 1. This is because the denominators are equal." },
    { number: 2, text: "Practice exercises\n1. Add 1/3 and 1/6.\n2. Write 3/4 as a decimal." },
  ], key, fetchSynthetic);
  expect(text.pages.map(page => page.questions.length)).toEqual([0, 2]);
  expect(text.pages[1].questions.every(question => question.topic?.trim())).toBe(true);
  const image = (await readFile(process.env.EDRA_GEMINI_SMOKE_IMAGE!)).toString("base64");
  const vision = await inspectQuestionPages([{ number: 1, image }], key, fetchSynthetic);
  expect(vision.pages[0].questions).toHaveLength(1);
  expect(vision.pages[0].questions[0].visuals.length).toBeGreaterThan(0);
  const { left, top, right, bottom } = vision.pages[0].questions[0].visuals[0].bounds;
  expect(left).toBeLessThan(0.3);
  expect(top).toBeLessThan(0.42);
  expect(right).toBeGreaterThan(0.59);
  expect(bottom).toBeGreaterThan(0.79);
  expect((right - left) * (bottom - top)).toBeLessThan(0.82);
}, 85_000);

it.skipIf(!process.env.EDRA_GEMINI_EXAM_IMAGE)("extracts two separate reference panels and leaves exam metadata and solutions out", async () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Set GEMINI_API_KEY for the opt-in smoke test");
  const image = (await readFile(process.env.EDRA_GEMINI_EXAM_IMAGE!)).toString("base64");
  const { pages: [page] } = await inspectQuestionPages([{ number: 1, image }], key);
  const task = page.questions.find(q => q.prompt.includes("Buffer") || q.prompt.includes("transfer"));
  expect(task?.number).toBe("2.A");
  expect(task?.visuals).toHaveLength(2);
  const [left, right] = task!.visuals.map(v => v.bounds).sort((a, b) => a.left - b.left);
  expect(left.right).toBeLessThan(right.left);
  expect(Math.max(left.bottom, right.bottom)).toBeLessThan(0.55);
  expect(page.questions).toHaveLength(2);
}, 50_000);
