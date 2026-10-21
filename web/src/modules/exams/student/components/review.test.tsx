// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";

const api = vi.hoisted(() => ({ sign: vi.fn(), signAnswering: vi.fn(), accountChange: [] as ((next: string | null) => void)[] }));
vi.mock("../actions", () => ({ signStudentExamReviewImages: api.sign, signStudentExamImages: api.signAnswering }));
vi.mock("../answering/cleanup", () => ({
  onExamAccountChange: (stop: (next: string | null) => void) => { api.accountChange.push(stop); return () => { api.accountChange = api.accountChange.filter((item) => item !== stop); }; },
}));
import { StudentExamReviewSection } from "./review";
import type { StudentExamReview } from "../types";

const id = (n: number) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;
const IMAGE = "abcdefab-abcd-4abc-8abc-abcdefabcdef";
const review: Extract<StudentExamReview, { status: "available" }> = {
  status: "available", accountId: id(1), serverNow: "2026-10-20T10:00:00Z", source: "online", notes: "Read chapter 2",
  parts: [
    { id: id(2), title: "Sheet", instructions: "", kind: "question_sheet", questions: [{
      id: id(3), number: 1, prompt: `Pick {{image:${IMAGE}}}`, excluded: false, kind: "question_sheet",
      choices: [{ id: id(4), label: "Right" }, { id: id(5), label: "Wrong" }],
      answer: { state: "choice", choiceId: id(5) }, correctChoiceId: id(4), modelAnswer: "",
    }] },
    { id: id(6), title: "Written", instructions: "", kind: "written_work", questions: [{
      id: id(7), number: 2, prompt: "Why?", excluded: true, kind: "written_work", choices: [],
      answer: { state: "paper_work" }, correctChoiceId: null, modelAnswer: "Because",
    }] },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.accountChange = [];
  api.sign.mockResolvedValue({ ok: true, kind: "urls", urls: { [IMAGE]: "https://signed/image" }, expiresInSeconds: 60 });
});
afterEach(cleanup);

const mount = () => render(<StrictMode><StudentExamReviewSection academyId={id(8)} examId={id(9)} review={review} /></StrictMode>);

describe("read-only exam review", () => {
  it("shows the accepted answer beside the released key without editing controls", async () => {
    mount();
    expect(screen.getByRole("heading", { name: "Question 1" })).toBeTruthy();
    expect(screen.getByText("Your answer").closest("li")?.textContent).toContain("Wrong");
    expect(screen.getByText("Correct answer").closest("li")?.textContent).toContain("Right");
    expect(screen.getByText("Read chapter 2")).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
    await waitFor(() => expect(api.sign).toHaveBeenCalledWith({ academyId: id(8), examId: id(9), imageIds: [IMAGE] }));
    expect(api.signAnswering).not.toHaveBeenCalled();
  });

  it("navigates only, marking excluded questions and paper work", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Question 2, excluded" }));
    expect(screen.getByRole("heading", { name: "Question 2" })).toBeTruthy();
    expect(screen.getByText("Excluded")).toBeTruthy();
    expect(screen.getByText("Completed on paper")).toBeTruthy();
    expect(screen.getByText("Because")).toBeTruthy();
    expect(screen.queryByText("No answer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Previous/ }));
    expect(screen.getByRole("heading", { name: "Question 1" })).toBeTruthy();
  });

  it("keeps material when a page load establishes the same account", () => {
    mount();
    act(() => { for (const stop of [...api.accountChange]) stop(review.accountId); });
    expect(screen.getByText("Answers and solutions")).toBeTruthy();
    expect(screen.getByText("Read chapter 2")).toBeTruthy();
  });

  it("clears visible material when the signed-in account changes", () => {
    mount();
    act(() => { for (const stop of [...api.accountChange]) stop(id(2)); });
    expect(screen.queryByText("Answers and solutions")).toBeNull();
    expect(screen.queryByText("Read chapter 2")).toBeNull();
  });
});
