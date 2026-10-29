import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn((path: string) => { throw new Error(`redirect:${path}`); }));
vi.mock("next/navigation", () => ({ redirect }));

import AssignmentsList from "@/app/app/[academySlug]/assignments/page";
import ExamsList from "@/app/app/[academySlug]/exams/page";
import QuizzesList from "@/app/app/[academySlug]/quizzes/page";

describe("legacy staff list routes", () => {
  it.each([
    [AssignmentsList, "assignment"], [QuizzesList, "quiz"], [ExamsList, "exam"],
  ] as const)("redirect to Assessments with the type selected (%#)", async (Page, type) => {
    await expect(Page({ params: Promise.resolve({ academySlug: "science" }) })).rejects.toThrow(`redirect:/science/assessments?type=${type}`);
  });
});
