import { describe, expect, it } from "vitest";
import { readAcademyDraft } from "./academy-draft";

describe("readAcademyDraft", () => {
  it("converts a stored draft that uses legacy level ids", () => {
    const draft = readAcademyDraft(JSON.stringify({
      name: "A", slug: "a", icon: "school", subject: "Math", customSubject: false,
      levelIds: ["grade-9", "grade-10", "grade-9"],
      tracks: [{ id: "t1", levelId: "grade-12", name: "Science" }],
    }));
    expect(draft.levelIds).toEqual(["preparatory-3", "secondary-1"]);
    expect(draft.tracks[0].levelId).toBe("secondary-3");
  });
});
