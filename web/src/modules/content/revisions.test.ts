import { expect, it } from "vitest";
import { historyEntries, revisionChanges } from "./revisions";
import type { ContentDocument } from "./types";

const video = { id: "00000000-0000-4000-8000-00000000000a", kind: "explanation" as const, title: "Intro", assetId: "00000000-0000-4000-8000-0000000000aa" };
const sheet = { id: "00000000-0000-4000-8000-00000000000b", kind: "document" as const, title: "Notes", assetId: "00000000-0000-4000-8000-0000000000bb" };
const base: ContentDocument = { title: "Lesson", description: "", accessDays: 7, items: [video, sheet] };

it("summarises the first publication", () => {
  expect(revisionChanges(null, base)).toEqual(["Published with 2 materials"]);
});

it("lists field, material, order and requirement changes", () => {
  const next: ContentDocument = { ...base, title: "Lesson 1", accessDays: 14, couponTypeId: "00000000-0000-4000-8000-000000000001",
    items: [{ ...sheet, title: "Worksheet" }, { id: "c", kind: "assessment", title: "Quiz", assessmentId: "q", assessmentKind: "quiz" }, video],
    prerequisites: [{ unitId: "u", kind: "quiz", assessmentId: "q0" }] };
  expect(revisionChanges(base, next)).toEqual([
    "Renamed from “Lesson” to “Lesson 1”",
    "Changed access from 7 days to 14 days",
    "Renamed document “Notes” to “Worksheet”",
    "Added assessment “Quiz”",
    "Reordered the material",
    "Required a coupon",
    "Added 1 required submission",
  ]);
});

it("reports removals without a spurious reorder", () => {
  expect(revisionChanges(base, { ...base, items: [sheet] })).toEqual(["Removed explanation video “Intro”"]);
  expect(revisionChanges(base, base)).toEqual([]);
});

it("merges drafts and publications into one timeline", () => {
  const draft = { ...base, title: "Draft title" };
  const entries = historyEntries(
    [{ kind: "saved", document: draft, at: "2026-10-03T00:00:00Z", by: "Mona" }, { kind: "created", document: base, at: "2026-10-01T00:00:00Z", by: "Mona" }],
    [{ revision: 2, document: draft, at: "2026-10-03T00:00:00Z", by: "Omar" }, { revision: 1, document: base, at: "2026-10-02T00:00:00Z", by: "Omar" }],
  );
  expect(entries.map(e => [e.kind, e.by, e.changes])).toEqual([
    ["published", "Omar", ["Renamed from “Lesson” to “Draft title”"]],
    ["saved", "Mona", ["Renamed from “Lesson” to “Draft title”"]],
    ["published", "Omar", ["Published with 2 materials"]],
    ["created", "Mona", ["Created the unit"]],
  ]);
  expect(historyEntries([{ kind: "saved", document: { bad: true }, at: "2026-10-01T00:00:00Z", by: null }], [])[0].changes).toBeNull();
});
