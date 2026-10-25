import { expect, it } from "vitest";
import { historyEntries, historyTime, revisionChanges } from "./revisions";
import type { ContentDocument } from "./types";

const video = { id: "00000000-0000-4000-8000-00000000000a", kind: "explanation" as const, title: "Intro", assetId: "00000000-0000-4000-8000-0000000000aa" };
const sheet = { id: "00000000-0000-4000-8000-00000000000b", kind: "document" as const, title: "Notes", assetId: "00000000-0000-4000-8000-0000000000bb" };
const base: ContentDocument = { title: "Lesson", description: "", accessDays: 7, items: [video, sheet] };

it("summarises the first publication", () => {
  expect(revisionChanges(null, base)).toEqual({ headline: "Published with 2 materials", groups: [], details: ["Explanation video “Intro”", "Document “Notes”"] });
});

it("builds a headline, grouped lines and itemised details", () => {
  const next: ContentDocument = { ...base, title: "Lesson 1", accessDays: 14, couponTypeId: "00000000-0000-4000-8000-000000000001",
    items: [{ ...sheet, title: "Worksheet" }, { id: "c", kind: "assessment", title: "Quiz", assessmentId: "q", assessmentKind: "quiz" }, video],
    prerequisites: [{ unitId: "u", kind: "quiz", assessmentId: "q0" }] };
  expect(revisionChanges(base, next)).toEqual({
    headline: "Added an assessment, renamed the unit and more",
    groups: [
      { label: "Material", parts: ["+1", "1 renamed", "Reordered"] },
      { label: "Details", parts: ["Title"] },
      { label: "Access", parts: ["7 → 14 days", "Coupon required", "+1 required"] },
    ],
    details: ["Title “Lesson” → “Lesson 1”", "Added assessment “Quiz”", "Renamed document “Notes” → “Worksheet”"],
  });
});

it("joins two changes and reports removals without a spurious reorder", () => {
  expect(revisionChanges(base, { ...base, items: [sheet], description: "New" })).toEqual({
    headline: "Removed a video and updated the description",
    groups: [{ label: "Material", parts: ["−1"] }, { label: "Details", parts: ["Description"] }],
    details: ["Removed video “Intro”"],
  });
  expect(revisionChanges(base, base).headline).toBe("");
});

it("merges consecutive draft saves into one entry between publications", () => {
  const mona = { id: "mona" }, omar = { id: "omar" };
  const draft = { ...base, title: "Draft title" }, more = { ...draft, accessDays: 14 };
  const entries = historyEntries(
    [{ kind: "saved", document: more, at: "2026-10-05T00:00:00Z", by: omar }, { kind: "saved", document: draft, at: "2026-10-04T00:00:00Z", by: mona },
      { kind: "saved", document: { ...base, description: "x" }, at: "2026-10-01T12:00:00Z", by: mona }, { kind: "created", document: { ...base, items: [] }, at: "2026-10-01T00:00:00Z", by: mona }],
    [{ revision: 1, document: base, at: "2026-10-02T00:00:00Z", by: omar }],
  );
  expect(entries.map(e => [e.kind, e.authors, e.saves, e.summary?.headline])).toEqual([
    ["draft", [omar, mona], 2, "Renamed the unit and changed access to 14 days"],
    ["published", [omar], 1, "Published with 2 materials"],
    ["draft", [mona], 2, "Created the unit"],
  ]);
  expect(entries[2].summary?.groups).toEqual([{ label: "Material", parts: ["+2"] }, { label: "Details", parts: ["Description"] }]);
  expect(historyEntries([{ kind: "saved", document: { bad: true }, at: "2026-10-01T00:00:00Z", by: null }], [])[0].summary).toBeNull();
});

it("labels history times relative to today", () => {
  const now = new Date(2026, 9, 25, 15, 0);
  const at = (d: Date) => d.toISOString();
  expect(historyTime(at(new Date(2026, 9, 25, 3, 21)), now, false)).toMatch(/^Today, /);
  expect(historyTime(at(new Date(2026, 9, 24, 0, 10)), now, false)).toMatch(/^Yesterday, /);
  expect(historyTime(at(new Date(2026, 9, 20, 9, 0)), now, false)).not.toMatch(/2026/);
  expect(historyTime(at(new Date(2025, 11, 30, 9, 0)), now, true)).toMatch(/2025/);
});
