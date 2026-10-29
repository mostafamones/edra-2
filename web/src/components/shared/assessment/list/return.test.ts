// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { assessmentListReturn, rememberAssessmentList } from "./return";

afterEach(() => sessionStorage.clear());

describe("returning to the Assessments list", () => {
  it("opens the list filtered to the item's type when nothing was remembered", () => {
    expect(assessmentListReturn("science", "assignments")).toBe("/app/assessments?type=assignment");
    expect(assessmentListReturn("science", "quizzes")).toBe("/app/assessments?type=quiz");
    expect(assessmentListReturn(undefined, "exams")).toBe("/app/assessments?type=exam");
  });

  it("restores the remembered list state when it covered this type", () => {
    rememberAssessmentList("science", "q=unit&page=3&sort=title");
    expect(assessmentListReturn("science", "exams")).toBe("/app/assessments?q=unit&page=3&sort=title");
    rememberAssessmentList("science", "type=quiz&page=2");
    expect(assessmentListReturn("science", "quizzes")).toBe("/app/assessments?type=quiz&page=2");
    expect(assessmentListReturn("science", "exams")).toBe("/app/assessments?type=exam");
    rememberAssessmentList("science", "");
    expect(assessmentListReturn("science", "quizzes")).toBe("/app/assessments");
  });

  it("keeps each academy's list state separate", () => {
    rememberAssessmentList("science", "page=4");
    expect(assessmentListReturn("math", "quizzes")).toBe("/app/assessments?type=quiz");
  });
});
