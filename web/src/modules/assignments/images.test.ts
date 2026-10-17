import { describe, expect, it } from "vitest";

import { imageToken } from "@/components/shared/assessment/images/tokens";
import type { DraftPart } from "./types";
import { assignmentDraftSchema } from "./validation";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("assignment question images", () => {
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
