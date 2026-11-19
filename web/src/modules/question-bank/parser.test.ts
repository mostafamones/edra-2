import { describe, expect, it } from "vitest";
import { parseImport, type SourcePage } from "./parser";

const page = (number: number, text: string, props: Partial<SourcePage> = {}): SourcePage => ({ number, text, mode: "text", ...props });

describe("question import evidence", () => {
  it("flags possible missing questions on pages with mixed heading formats", () => {
    const result = parseImport([page(1, "Question 1: Find the median.\n2. Explain the result.\n2 – 4  7")]);
    expect(result.questions.map(q => q.number)).toEqual(["1"]);
    expect(result.questions[0].prompt).toContain("2. Explain the result.");
    expect(result.questions[0].issues).toContain("Check whether this text contains another question");
    expect(result.issues).toContainEqual({ source: "Book", page: 1, reason: "Mixed question numbering: check for a missed question", retryable: false });
  });

  it("skips labelled worked examples and links an embedded answer without treating the key as exercises", () => {
    const book = [
      page(1, "3. Worked example: Add two and two.\nSolution: Four.\nQuestion 4: Which is even?\nA) 3\nB) 4\nQuestion 5: Explain how you checked."),
      page(2, "Use a second example to check your reasoning."),
      page(3, "Answer key\n4. B\n5. A is not a standalone key entry."),
    ];
    const report = parseImport(book);
    expect(report.questions.map(q => q.number)).toEqual(["4", "5"]);
    expect(report.questions[0].answer).toEqual({ key: "B", page: 3, source: "book" });
    expect(report.questions[1].continuations?.map(p => p.page)).toEqual([2]);
    expect(parseImport(book, [page(1, "4. A")]).questions[0].answer).toEqual({ key: "A", page: 1 });
  });

  it("matches restarted numbers by bilingual chapter and preserves Arabic text and math", () => {
    const result = parseImport([
      page(1, "Algebra\n1. Factor x² − 9. (A) Correct (B) Wrong"),
      page(2, "التفاضل والتكامل\n١. أوجد مشتقة الدالة y = x³.\nأ) x²\nب) 3x²"),
    ], [page(1, "Calculus\n1. B\nAlgebra\n1. A")]);
    expect(result.questions.map(q => q.answer?.key)).toEqual(["A", "B"]);
    expect(result.questions[1].prompt).toBe("أوجد مشتقة الدالة y = x³.");
  });

  it("does not borrow an answer from another chapter or silently resolve duplicate keys", () => {
    const [unmatched, ambiguous] = parseImport([
      page(1, "Algebra\n1. First stem (A) Alpha (B) Beta"),
      page(2, "Calculus\n1. Second stem (A) Alpha (B) Beta"),
    ], [page(1, "Calculus\n1. A\n1. B")]).questions;
    expect(unmatched.answer).toBeUndefined();
    expect(unmatched.issues).toContain("No answer found in this section");
    expect(ambiguous.answer).toBeUndefined();
    expect(ambiguous.issues).toContain("Multiple answers have this section and number");
  });

  it("reports a failed page and does not carry a chapter across it", () => {
    const result = parseImport([
      page(1, "Algebra\n1. First prompt"),
      page(2, "", { error: "Couldn’t read this page" }),
      page(3, "1. Possibly a different chapter (A) One (B) Two"),
    ], [page(1, "Algebra\n1. A")]);
    expect(result.issues).toContainEqual({ source: "Book", page: 2, reason: "Couldn’t read this page", retryable: false });
    expect(result.questions[1]).toMatchObject({ page: 3, section: null, issues: ["Section not identified"] });
    expect(result.questions[1].answer).toBeUndefined();
  });

  it("does not treat a heading-only text layer with additional content as successfully parsed", () => {
    const result = parseImport([page(1, "Algebra\nUnparsed material from the body"), page(2, "4. Um o Es uo الرسم وحل المعادلة", { mode: "scan" })]);
    expect(result.questions).toHaveLength(0);
    expect(result.issues.map(issue => issue.reason)).toEqual(["No numbered questions detected", "Scanned question page needs visual extraction"]);
  });

  it("keeps frequency ranges inside printed questions and removes response-line filler", () => {
    const result = parseImport([
      page(1, "Question 1: (6 marks)\nComplete the frequency table below.\n0   –   2   4\n3   –   5   3\nMode: ............\nQuestion 2: (4 marks)\nCalculate the mean.", {
        lineTops: [0.08, 0.14, 0.2, 0.23, 0.3, 0.5, 0.55],
      }),
    ]);
    expect(result.questions.map(q => q.number)).toEqual(["1", "2"]);
    expect(result.questions[0].prompt).toContain("0   –   2   4");
    expect(result.questions[0].prompt).not.toContain("............");
    expect(result.questions[0].issues).toEqual(["Check the chart, table or figure against the source"]);
    expect(result.questions[0].crop?.bottom).toBeLessThan(0.5);
    expect(result.issues).toEqual([]);
  });

  it("retains uncertain cross-page evidence without silently appending it to the editable prompt", () => {
    const result = parseImport([
      page(1, "Question 1: Find the median."),
      page(2, "Use these values: 1, 3, 8\nQuestion 2: What is the range?", { lineTops: [0.1, 0.6] }),
      page(3, "Final part: Explain your answer."),
    ]);
    expect(result.questions[0].prompt).toBe("Find the median.");
    expect(result.questions[0].continuations?.[0]).toMatchObject({ page: 2, crop: { top: 0 } });
    expect(result.questions[1].continuations?.[0].page).toBe(3);
    expect(result.questions[1].issues).toContain("Check the possible continuation on page 3");
  });

  it("matches flat keys only for a flat book and withholds answers for duplicate numbers", () => {
    const book = [page(1, "Question 1: Pick one (A) One (B) Two")];
    const key = [page(1, "1. B")];
    expect(parseImport(book, key).questions[0].answer?.key).toBe("B");
    const duplicate = parseImport([...book, page(2, book[0].text)], key);
    expect(duplicate.questions.every(q => !q.answer && q.issues.includes("Question number is repeated"))).toBe(true);
  });

  it("keeps lettered English and Arabic written subparts intact", () => {
    const result = parseImport([
      page(1, "Question 1: Use the grouped data.\na) Calculate the mean.\nb) Explain your answer.\nc) Draw a graph."),
      page(2, "السؤال ٢: استخدم الشكل.\nأ) أوجد قيمة س.\nب) اشرح الحل."),
      page(3, "Question 3: Consider A - B as the difference.\n(a) Use your results (2 marks).\n(b) Comment on the result (2 marks)."),
    ]);
    expect(result.questions.map(q => q.choices)).toEqual([[], [], []]);
    expect(result.questions.map(q => q.issues)).toEqual(Array.from({ length: 3 }, () => ["Check the written subparts against the source"]));
    expect(result.questions[0].prompt).toContain("b) Explain your answer.");
    expect(result.questions[1].prompt).toContain("أ) أوجد قيمة س.");
    expect(result.questions[2].prompt).toContain("Consider A - B as the difference.\n(a) Use your results");
  });

  it("keeps an unordered set of possible choices in the prompt instead of assigning an answer", () => {
    const [q] = parseImport([page(1, "Question 1: Which value?\nA) 0\nC) 1")], [page(1, "1. A")]).questions;
    expect(q.prompt).toContain("A) 0\nC) 1");
    expect(q.choices).toEqual([]);
    expect(q.answer).toBeUndefined();
    expect(q.issues).toContain("Check the possible choices against the source");
  });
});
