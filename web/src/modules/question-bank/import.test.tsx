// @vitest-environment jsdom
import { cleanup, fireEvent, render as baseRender, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadQuestionBankCatalog, loadQuestionBankCollections, saveQuestionBank } from "./bank";
import type { SaveBankInput } from "./bank-contract";
import { QuestionImportPage as QuestionBankPage } from "./import";
import { cropSource } from "./evidence";
import { inspectPdf, readPdf } from "./pdf";
import { reviewQuestionPage } from "./review";

vi.mock("./pdf", () => ({ inspectPdf: vi.fn(), readPdf: vi.fn(), retryPage: vi.fn() }));
vi.mock("./evidence", async importOriginal => ({ ...await importOriginal<typeof import("./evidence")>(), cropSource: vi.fn(), assessSuggestedCrop: vi.fn() }));
vi.mock("./review", () => ({ reviewQuestionPage: vi.fn() }));
vi.mock("./leave-guard", () => ({ LeaveGuard: () => null }));
vi.mock("./bank", () => ({ saveQuestionBank: vi.fn(), loadQuestionBankCollections: vi.fn(), loadQuestionBankCatalog: vi.fn(), listQuestionBank: vi.fn(), readQuestionBank: vi.fn() }));

function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return baseRender(ui, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}

Element.prototype.scrollIntoView ??= () => {};
beforeEach(() => { vi.mocked(inspectPdf).mockResolvedValue(4); });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function startExtraction(name: string) {
  const button = screen.getByRole<HTMLButtonElement>("button", { name });
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
}

it("loads page 21 as context when importing page 22 and keeps its exercises out of the queue", async () => {
  vi.mocked(inspectPdf).mockResolvedValueOnce(25);
  vi.mocked(readPdf).mockResolvedValueOnce([
    { number: 22, mode: "text", text: "12. x + y = 7 and x - y = 3." },
  ]).mockResolvedValueOnce([{ number: 21, mode: "text", text: "2. Solve each equation pair over the real numbers. 11. x+y=5, x-y=1" }]);
  vi.mocked(reviewQuestionPage).mockResolvedValueOnce({ ok: true, review: { pages: [{
    number: 22, kind: "questions", note: "", needsImage: false, questions: [{
      number: "2.12", section: null, prompt: "Solve each equation pair over the real numbers. x+y=7, x-y=3", choices: [], check: "", continuationPages: [], visuals: [],
    }],
  }] } });
  render(<QuestionBankPage geminiAcademyId="a0000000-0000-4000-8000-000000000001" />);
  fireEvent.change(screen.getByLabelText("Question PDFs"), { target: { files: [new File(["pdf"], "Arabic.pdf")] } });
  const first = await screen.findByLabelText("First page");
  await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>("Last page").value).toBe("24"));
  fireEvent.change(first, { target: { value: "22" } });
  fireEvent.change(screen.getByLabelText("Last page"), { target: { value: "22" } });
  await startExtraction("Extract with Gemini");
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Extract with Gemini" }));
  await screen.findByRole("button", { name: "Question 2.12, page 22" });
  expect(vi.mocked(readPdf).mock.calls.map(call => call[3])).toEqual([{ first: 22, last: 22 }, { first: 21, last: 21 }]);
  expect(vi.mocked(reviewQuestionPage).mock.calls[0][0]?.data).toMatchObject({ pages: [{ number: 22 }], previousPage: { number: 21 } });
  expect(screen.queryByRole("button", { name: /Question.*page 21/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Previous page · 21" }));
  expect(within(screen.getByRole("region", { name: "Original document" })).getByText(/2\. Solve each equation pair/)).toBeTruthy();
});

it("renders imported equations, keeps editable LaTeX, and prevents reviewing broken notation", async () => {
  const prompt = String.raw`أوجد \(\frac{\text{س}}{٢} + \sqrt{٩}\)`;
  vi.mocked(inspectPdf).mockResolvedValueOnce(1);
  vi.mocked(readPdf).mockResolvedValueOnce([{ number: 1, mode: "text", text: "Practice exercise 1: calculate the requested value." }]);
  vi.mocked(reviewQuestionPage).mockResolvedValueOnce({ ok: true, review: { pages: [{
    number: 1, kind: "questions", note: "", needsImage: false, questions: [{
      number: "1", section: null, prompt, choices: [], check: "", continuationPages: [], visuals: [], modelAnswer: String.raw`\(\text{س}^{٢}\)`,
    }],
  }] } });
  const { container } = render(<QuestionBankPage geminiAcademyId="a0000000-0000-4000-8000-000000000001" />);
  fireEvent.change(screen.getByLabelText("Question PDFs"), { target: { files: [new File(["pdf"], "Arabic.pdf")] } });
  await startExtraction("Extract with Gemini");
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Extract with Gemini" }));
  await screen.findByRole("button", { name: "Question 1, page 1" });
  expect(container.querySelector("mfrac")).not.toBeNull();
  expect(container.querySelector("msqrt")).not.toBeNull();
  expect(container.querySelector("msup")).not.toBeNull();
  expect(screen.queryByRole("textbox", { name: "Prompt" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit Prompt source" }));
  const field = screen.getByLabelText<HTMLTextAreaElement>("Prompt");
  expect(field.value).toBe(prompt);
  fireEvent.change(field, { target: { value: String.raw`\(\frac{1}{2}` } });
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Mark reviewed" }).disabled).toBe(true);
  expect(field.getAttribute("aria-invalid")).toBe("true");
  fireEvent.change(field, { target: { value: prompt } });
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Mark reviewed" }).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Preview Prompt" }));
  expect(screen.queryByRole("textbox", { name: "Prompt" })).toBeNull();
  expect(container.querySelector("mfrac")).not.toBeNull();
});

it("keeps a scanned explanation out of the draft queue and prepares only that page for visual extraction", async () => {
  vi.mocked(inspectPdf).mockResolvedValueOnce(597);
  vi.mocked(readPdf).mockResolvedValueOnce([{
    number: 9, mode: "scan", text: "4. Um o Es uo الرسم وحل المعادلة",
    image: new Blob(["scan"], { type: "image/jpeg" }),
  }]);
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => "blob:test");
    static revokeObjectURL = vi.fn();
  });
  render(<QuestionBankPage geminiAcademyId="a0000000-0000-4000-8000-000000000001" />);
  fireEvent.change(screen.getByLabelText("Question PDFs"), { target: { files: [new File(["pdf"], "Arabic math.pdf")] } });
  await startExtraction("Extract locally");
  expect(await screen.findByText("Scanned question page needs visual extraction")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Question 4, page 9" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open page 9 for visual extraction" }));
  expect(screen.getByLabelText<HTMLInputElement>("First page").value).toBe("9");
  expect(screen.getByLabelText<HTMLInputElement>("Last page").value).toBe("9");
  expect(reviewQuestionPage).not.toHaveBeenCalled();
});

it("selects multiple PDFs and reviews only the chosen end range of a 600-page book", async () => {
  vi.mocked(inspectPdf).mockResolvedValueOnce(600);
  const book = new File(["pdf"], "Full book.pdf");
  const other = new File(["pdf"], "Second book.pdf");
  vi.mocked(readPdf).mockResolvedValueOnce([{ number: 600, mode: "text", text: "Question 1: Explain why the last page matters." }]);
  render(<QuestionBankPage />);
  fireEvent.change(screen.getByLabelText("Question PDFs"), { target: { files: [book, other] } });
  expect(screen.getByRole("combobox", { name: "PDF to import" }).textContent).toContain(book.name);
  const first = await screen.findByLabelText<HTMLInputElement>("First page");
  expect(screen.getByLabelText<HTMLInputElement>("Last page").value).toBe("24");
  fireEvent.change(first, { target: { value: "590" } });
  expect(screen.getByLabelText<HTMLInputElement>("Last page").value).toBe("600");
  fireEvent.change(screen.getByLabelText("Last page"), { target: { value: "601" } });
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Extract questions" }).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Last page"), { target: { value: "600" } });
  await startExtraction("Extract questions");
  expect(await screen.findByText("Pages 590–600")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Question 1, page 600" })).toBeTruthy();
  expect(readPdf).toHaveBeenCalledExactlyOnceWith(book, expect.any(Function), "local", { first: 590, last: 600 }, expect.any(AbortSignal));
});

it("keeps the current review when the next range is cancelled", async () => {
  vi.mocked(inspectPdf).mockResolvedValueOnce(600);
  vi.mocked(readPdf).mockResolvedValueOnce([{ number: 1, mode: "text", text: "Question 1: Explain the first concept." }]);
  let finish!: (pages: Awaited<ReturnType<typeof readPdf>>) => void;
  vi.mocked(readPdf).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<QuestionBankPage />);
  fireEvent.change(screen.getByLabelText("Question PDFs"), { target: { files: [new File(["pdf"], "Full book.pdf")] } });
  await startExtraction("Extract questions");
  fireEvent.click(await screen.findByRole("button", { name: "Next pages: 25–48" }));
  expect(screen.getByLabelText<HTMLInputElement>("First page").value).toBe("25");
  await startExtraction("Extract questions");
  expect(readPdf).toHaveBeenCalledTimes(1);
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Start new review" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel import" }));
  expect(vi.mocked(readPdf).mock.calls[1][4]?.aborted).toBe(true);
  finish([{ number: 25, mode: "text", text: "Question 25: Explain the next concept." }]);
  await waitFor(() => expect(screen.queryByText("Stopping import…")).toBeNull());
  expect(screen.getByRole("button", { name: "Question 1, page 1" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Question 25, page 25" })).toBeNull();
});

it("retries only the missing page and keeps a reviewed question and its edits", async () => {
  const draft = { number: "1", section: null, prompt: "Explain the first concept.", choices: [], check: "", continuationPages: [], visuals: [] };
  vi.mocked(readPdf).mockResolvedValueOnce([
    { number: 1, mode: "text", text: "Question 1: Explain the first concept." },
    { number: 2, mode: "text", text: "Question 2: Explain the second concept." },
  ]);
  vi.mocked(reviewQuestionPage).mockResolvedValueOnce({ ok: true, review: { pages: [
    { number: 1, kind: "questions", note: "", needsImage: false, questions: [draft] },
  ] } }).mockResolvedValueOnce({ ok: true, review: { pages: [
    { number: 2, kind: "questions", note: "", needsImage: false, questions: [{ ...draft, number: "2", prompt: "Explain the second concept." }] },
  ] } });
  render(<QuestionBankPage geminiAcademyId="a0000000-0000-4000-8000-000000000001" />);
  fireEvent.change(screen.getByLabelText("Question PDFs"), { target: { files: [new File(["pdf"], "Book.pdf")] } });
  await startExtraction("Extract with Gemini");
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Extract with Gemini" }));
  fireEvent.change(await screen.findByLabelText("Prompt"), { target: { value: "My corrected prompt." } });
  fireEvent.click(screen.getByRole("button", { name: "Mark reviewed" }));
  fireEvent.click(screen.getByRole("button", { name: "Retry 1 failed page with Gemini" }));
  expect(await screen.findByRole("button", { name: "Question 2, page 2" })).toBeTruthy();
  expect(screen.getByLabelText<HTMLTextAreaElement>("Prompt").value).toBe("My corrected prompt.");
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Export reviewed (1)" }).disabled).toBe(false);
  expect(vi.mocked(reviewQuestionPage).mock.calls.map(([request]) => request?.data)).toEqual([
    expect.objectContaining({ pages: [expect.objectContaining({ number: 1 }), expect.objectContaining({ number: 2 })] }),
    expect.objectContaining({ pages: [expect.objectContaining({ number: 2 })] }),
  ]);
  expect(readPdf).toHaveBeenCalledTimes(1);
});

it("asks before sending, batches text, sends figures with their source text, and attaches the crop to a draft", async () => {
  const pageImage = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" });
  const visualImage = new Blob(["crop"], { type: "image/jpeg" });
  const bounds = { left: 0.2, top: 0.3, right: 0.8, bottom: 0.7 };
  const draft = { number: "3", section: null, prompt: "Find the missing height using the graph.", choices: [], check: "", continuationPages: [], visuals: [{ description: "Height graph", bounds }] };
  const academyId = "a0000000-0000-4000-8000-000000000001";
  const explanation = "Worked example: what happens when we double x? The answer is 2x.";
  const practice = "Practice: solve the following equation. 1. Find x if x + 2 = 5.";
  vi.mocked(readPdf).mockResolvedValueOnce([
    { number: 1, mode: "text", text: explanation },
    { number: 2, mode: "text", text: practice },
    { number: 3, mode: "text", text: "Question 3: See the graph below.", image: pageImage },
  ]).mockResolvedValueOnce([{ number: 1, text: "Answer key\n1. B", mode: "text" }]);
  vi.mocked(reviewQuestionPage).mockResolvedValueOnce({ ok: true, review: { pages: [
    { number: 1, kind: "reference", questions: [], note: "", needsImage: false },
    { number: 2, kind: "questions", questions: [{ ...draft, number: "1", prompt: "Find x if x + 2 = 5.", topic: "Linear equations", visuals: [] }], note: "", needsImage: false },
  ] } }).mockResolvedValueOnce({ ok: true, review: { pages: [
    { number: 3, kind: "questions", questions: [draft], note: "", needsImage: false },
  ] } });
  vi.mocked(cropSource).mockResolvedValue(visualImage);
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => "blob:test");
    static revokeObjectURL = vi.fn();
  });
  render(<QuestionBankPage geminiAcademyId={academyId} />);
  fireEvent.change(screen.getByLabelText("Question PDFs"), { target: { files: [new File(["pdf"], "Book.pdf")] } });
  fireEvent.change(screen.getByLabelText("Answer key (optional PDF)"), { target: { files: [new File(["pdf"], "Key.pdf")] } });
  await startExtraction("Extract with Gemini");
  expect(reviewQuestionPage).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Extract with Gemini" }));
  fireEvent.click(await screen.findByRole("button", { name: "Question 3, page 3" }));
  expect(screen.queryByRole("button", { name: "Question 1, page 1" })).toBeNull();
  expect(screen.getByRole("img", { name: "Height graph" })).toBeTruthy();
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Export reviewed (0)" }).disabled).toBe(true);
  expect(cropSource).toHaveBeenCalledWith(pageImage, bounds);
  expect(vi.mocked(readPdf).mock.calls.map(call => call[2])).toEqual(["gemini", "answer-key"]);
  expect(vi.mocked(reviewQuestionPage).mock.calls.map(([args]) => args?.data)).toEqual([
    { academyId, pages: [{ number: 1, text: explanation }, { number: 2, text: practice }] },
    { academyId, pages: [{ number: 3, image: "/9j/4A==", sourceText: "Question 3: See the graph below." }], knownTopics: ["Linear equations"], previousPage: { number: 2, text: practice } },
  ]);
});

it("opens an embedded answer at the correct page of the original PDF", async () => {
  vi.mocked(readPdf).mockResolvedValue([
    { number: 1, text: "Question 1: Which value is even?\nA) 3\nB) 4", mode: "text" },
    { number: 2, text: "Answer key\n1. B", mode: "text" },
  ]);
  render(<QuestionBankPage />);
  fireEvent.change(screen.getByLabelText("Question PDFs"), { target: { files: [new File(["pdf"], "Exam.pdf")] } });
  await startExtraction("Extract questions");
  fireEvent.click(await screen.findByRole("button", { name: "Suggested key: B · Answer page 2" }));
  const source = within(screen.getByRole("region", { name: "Original document" }));
  expect(source.getByText("Exam.pdf")).toBeTruthy();
  expect(source.getByText("Page 2")).toBeTruthy();
});

it("lets staff confirm a PDF-marked choice and shows printed written solutions separately from the prompt", async () => {
  const base = { section: null, check: "", continuationPages: [], visuals: [] };
  vi.mocked(readPdf).mockResolvedValueOnce([{ number: 1, text: "Question 1: Which number is even? Question 2: Explain.", mode: "text" }]);
  vi.mocked(reviewQuestionPage).mockResolvedValueOnce({ ok: true, review: { pages: [{
    number: 1, kind: "questions", note: "", needsImage: false, questions: [
      { ...base, number: "1", prompt: "Which number is even?", choices: [{ key: "a", text: "3" }, { key: "b", text: "4" }], markedChoiceKey: "B" },
      { ...base, number: "2", prompt: "Write the return statement.", choices: [], modelAnswer: "return 4;" },
    ],
  }] } });
  render(<QuestionBankPage geminiAcademyId="a0000000-0000-4000-8000-000000000001" />);
  fireEvent.change(screen.getByLabelText("Question PDFs"), { target: { files: [new File(["pdf"], "Exam.pdf")] } });
  await startExtraction("Extract with Gemini");
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Extract with Gemini" }));
  expect(await screen.findByText("No answer confirmed")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Marked in PDF: b · Page 1" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Confirm suggested answer" }));
  expect(screen.getByText("Confirmed answer: b")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Question 2, page 1" }));
  expect(screen.getByLabelText<HTMLTextAreaElement>("Prompt").value).toBe("Write the return statement.");
  expect(screen.getByLabelText<HTMLTextAreaElement>("Model answer").value).toBe("return 4;");
});

it("keeps a suggested key separate from confirmation and resets it after edits", () => {
  render(<QuestionBankPage />);
  fireEvent.click(screen.getByRole("button", { name: "Try sample" }));
  const exportButton = screen.getByRole<HTMLButtonElement>("button", { name: "Export reviewed (0)" });
  expect(exportButton.disabled).toBe(true);
  expect(screen.getByText("No answer confirmed")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Suggested key: A · Answer page 1" }));
  expect(screen.getByText("Sample answer key")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Confirm choice A as the answer" }));
  fireEvent.click(screen.getByRole("button", { name: "Mark reviewed" }));
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Export reviewed (1)" }).disabled).toBe(false);
  fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "Updated prompt" } });
  expect(screen.getByText("No answer confirmed")).toBeTruthy();
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Export reviewed (0)" }).disabled).toBe(true);
});

it("excludes a bad candidate from export and lets a reviewer restore it", () => {
  render(<QuestionBankPage />);
  fireEvent.click(screen.getByRole("button", { name: "Try sample" }));
  fireEvent.click(screen.getByRole("button", { name: "Mark reviewed" }));
  fireEvent.click(screen.getByRole("button", { name: "Exclude question" }));
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Export reviewed (0)" }).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Excluded 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Question 1, Algebra, page 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Restore question" }));
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Export reviewed (1)" }).disabled).toBe(false);
});

it("opens page issues separately from the question review queue", () => {
  render(<QuestionBankPage />);
  fireEvent.click(screen.getByRole("button", { name: "Try sample" }));
  const queue = screen.getByRole("navigation", { name: "Review queue" });
  fireEvent.click(within(queue).getByRole("button", { name: /^Check \d+$/ }));
  expect(within(queue).queryByText("The scan could not be read")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "1 page issue" }));
  expect(screen.queryByRole("navigation", { name: "Review queue" })).toBeNull();
  const pages = screen.getByRole("navigation", { name: "Pages with issues" });
  expect(within(pages).getByRole("button", { name: "Book · Page 3" })).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "Page issue details" })).getByText("The scan could not be read")).toBeTruthy();
  fireEvent.click(within(pages).getByRole("button", { name: "Back to questions" }));
  expect(within(screen.getByRole("navigation", { name: "Review queue" })).getByRole("button", { name: "Question 1, Algebra, page 1" })).toBeTruthy();
});

it("confirms a topic in bulk, filters the queue, and exports it without changing printed source labels", async () => {
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:topics");
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(<QuestionBankPage />);
  fireEvent.click(screen.getByRole("button", { name: "Try sample" }));
  fireEvent.click(screen.getByRole("button", { name: "Review topics" }));
  const dialog = within(screen.getByRole("dialog"));
  fireEvent.click(dialog.getByRole("button", { name: /Reading comprehension/ }));
  fireEvent.click(dialog.getByRole("checkbox", { name: "Select all" }));
  expect(dialog.getByRole("status").textContent).toBe("2 selected");
  fireEvent.click(dialog.getByRole("button", { name: "Confirm topic" }));
  expect(dialog.queryByText("Suggested")).toBeNull();
  fireEvent.click(dialog.getByRole("button", { name: "View in queue" }));
  const queue = within(screen.getByRole("navigation", { name: "Review queue" }));
  expect(queue.queryByRole("button", { name: /Algebra/ })).toBeNull();
  expect(queue.getAllByRole("button", { name: /Reading comprehension, page 4/ })).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Mark reviewed" }));
  fireEvent.click(screen.getByRole("button", { name: "Export reviewed (1)" }));
  const exported = () => createObjectURL.mock.calls.find(([blob]) => blob.type === "application/json")?.[0];
  await waitFor(() => expect(exported()).toBeDefined());
  const json = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(exported()!);
  });
  expect(JSON.parse(json).questions[0]).toMatchObject({
    section: "Reading comprehension", printedNumber: "1", topic: { label: "Reading comprehension", verification: "confirmed" },
  });
  expect(reviewQuestionPage).not.toHaveBeenCalled();
});

it("attaches a labelled crop and exports its image and source bounds with the reviewed question", async () => {
  const pageImage = new Blob(["full page"], { type: "image/jpeg" });
  const visualImage = new Blob(["cropped table"], { type: "image/jpeg" });
  vi.mocked(readPdf).mockResolvedValue([{ number: 1, text: "Question 1: Complete the table below.", mode: "text", image: pageImage }]);
  vi.mocked(cropSource).mockResolvedValue(visualImage);
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:test");
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(<QuestionBankPage />);
  fireEvent.change(screen.getByLabelText("Question PDFs"), { target: { files: [new File(["pdf"], "Exam.pdf")] } });
  await startExtraction("Extract questions");
  fireEvent.click(await screen.findByRole("button", { name: "Crop visual" }));
  const dialog = within(screen.getByRole("dialog"));
  fireEvent.change(dialog.getByLabelText("Image description"), { target: { value: "Frequency table" } });
  fireEvent.change(dialog.getByLabelText("left"), { target: { value: "95" } });
  expect(dialog.getByRole<HTMLButtonElement>("button", { name: "Attach image" }).disabled).toBe(true);
  fireEvent.change(dialog.getByLabelText("left"), { target: { value: "20" } });
  fireEvent.change(dialog.getByLabelText("right"), { target: { value: "80" } });
  fireEvent.click(dialog.getByRole("button", { name: "Attach image" }));
  await screen.findByRole("img", { name: "Frequency table" });
  expect(cropSource).toHaveBeenCalledWith(pageImage, { left: 0.2, right: 0.8, top: 0.08, bottom: 0.92 });
  fireEvent.click(screen.getByRole("button", { name: "Mark reviewed" }));
  fireEvent.click(screen.getByRole("button", { name: "Export reviewed (1)" }));
  const exported = () => createObjectURL.mock.calls.find(([blob]) => blob.type === "application/json")?.[0];
  await waitFor(() => expect(exported()).toBeDefined());
  const json = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(exported()!);
  });
  expect(JSON.parse(json).questions[0].visuals[0]).toMatchObject({
    description: "Frequency table",
    source: { page: 1, bounds: { left: 0.2, right: 0.8 } },
    image: "data:image/jpeg;base64,Y3JvcHBlZCB0YWJsZQ==",
  });
  fireEvent.click(screen.getByRole("button", { name: "Adjust crop" }));
  const adjustment = within(screen.getByRole("dialog"));
  expect(adjustment.getByLabelText<HTMLInputElement>("left").value).toBe("20");
  fireEvent.change(adjustment.getByLabelText("Image description"), { target: { value: "Grouped frequency table" } });
  fireEvent.click(adjustment.getByRole("button", { name: "Save crop" }));
  await screen.findByRole("img", { name: "Grouped frequency table" });
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Export reviewed (0)" }).disabled).toBe(true);
});

it("saves confirmed topics and automatic source grouping, keeping one document identity across save batches", async () => {
  vi.mocked(loadQuestionBankCollections).mockResolvedValue({ ok: true, data: { total: 0, archived: 0, collections: [] } });
  vi.mocked(loadQuestionBankCatalog).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(saveQuestionBank).mockResolvedValue({ ok: true, data: 1 });
  render(<QuestionBankPage bankScope={{ academyId: "a0000000-0000-4000-8000-000000000001", academySlug: "science", accountId: "staff" }} />);
  fireEvent.click(screen.getByRole("button", { name: "Try sample" }));
  fireEvent.click(screen.getByRole("button", { name: "Review topics" }));
  let dialog = within(screen.getByRole("dialog"));
  fireEvent.click(dialog.getByRole("button", { name: /Reading comprehension/ }));
  fireEvent.click(dialog.getByRole("checkbox", { name: "Select all" }));
  fireEvent.click(dialog.getByRole("button", { name: "Confirm topic" }));
  fireEvent.click(dialog.getByRole("checkbox", { name: "Select all" }));
  fireEvent.click(dialog.getByRole("combobox", { name: "Topic" }));
  fireEvent.click(await screen.findByRole("option", { name: "New topic" }));
  dialog = within(screen.getByRole("dialog"));
  fireEvent.change(dialog.getByLabelText("Topic name"), { target: { value: "Lighting" } });
  fireEvent.click(dialog.getByRole("button", { name: "Add topic" }));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  async function save(number: string) {
    fireEvent.click(screen.getByRole("button", { name: `Question ${number}, Reading comprehension, page 4` }));
    expect(screen.getByText("Lighting")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mark reviewed" }));
    fireEvent.click(screen.getByRole("button", { name: "Save to bank" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save 1 question" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    return vi.mocked(saveQuestionBank).mock.lastCall![0]!.data as SaveBankInput;
  }
  const first = await save("1");
  expect(first.document.name).toBe("Sample question book");
  expect(first.questions).toHaveLength(1);
  expect(first.questions[0]).toMatchObject({
    topics: ["Reading comprehension", "Lighting"],
    section: { name: "Reading comprehension", firstPage: 4, continues: false },
    payload: { topic: null, section: "Reading comprehension", printedNumber: "1", source: { page: 4 } },
  });
  expect(screen.getByRole("link", { name: "Open library" })).toBeTruthy();
  const second = await save("2");
  expect(second.document).toEqual(first.document);
  expect(second.questions[0].section).toEqual(first.questions[0].section);
  expect(second.questions[0].id).not.toBe(first.questions[0].id);
});
