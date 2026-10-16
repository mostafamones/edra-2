import { describe, expect, it } from "vitest";

import { imageIds, imageToken, questionImageCount, splitImages } from "./images";
import type { DraftPart } from "./types";
import { assignmentDraftSchema } from "./validation";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("question image tokens", () => {
  it("splits text into text and image runs", () => {
    expect(splitImages(`See ${imageToken(A)} and${imageToken(B)}`)).toEqual([
      { type: "text", text: "See " }, { type: "image", id: A }, { type: "text", text: " and" }, { type: "image", id: B },
    ]);
    expect(splitImages("plain")).toEqual([{ type: "text", text: "plain" }]);
    expect(splitImages("")).toEqual([]);
  });

  it("ignores malformed tokens", () => {
    expect(imageIds("{{image:not-a-uuid}} {{image:AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA}}")).toEqual([]);
  });

  it("counts images across a question's text and choices", () => {
    expect(questionImageCount({ prompt: imageToken(A) + imageToken(B), choices: [{ label: imageToken(A) }, { label: "x" }] })).toBe(3);
  });

  it("rejects a question with more than ten images", () => {
    const question = (count: number) => ({
      prompt: imageToken(A).repeat(count - 1), maxScore: "1",
      choices: [{ label: imageToken(B), isCorrect: true }, { label: "b", isCorrect: false }],
    });
    const draft = (count: number) => ({
      title: "Unit", instructions: "", audience: "level" as const, levelId: "secondary-1", trackId: null, groupIds: [], dueAt: null,
      parts: [{ title: "P", instructions: "", kind: "online_questions", maxScore: "0", questions: [question(count)] }] as DraftPart[],
    });
    expect(assignmentDraftSchema.safeParse(draft(10)).success).toBe(true);
    expect(assignmentDraftSchema.safeParse(draft(11)).success).toBe(false);
  });
});
