import { expect, it } from "vitest";
import { revisionChanges } from "./revisions";
import type { ContentDocument } from "./types";

const video = { id: "a", kind: "explanation" as const, title: "Intro", assetId: "asset-a" };
const sheet = { id: "b", kind: "document" as const, title: "Notes", assetId: "asset-b" };
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
  expect(revisionChanges(base, base)).toEqual(["Republished without changes"]);
});
