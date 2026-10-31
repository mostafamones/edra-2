import { expect, it } from "vitest";
import { historyEntries, historyTime, revisionChanges, timeAgo } from "./revisions";
import type { ContentDocument } from "./types";

const video = { id: "00000000-0000-4000-8000-00000000000a", kind: "explanation" as const, title: "Intro", assetId: "00000000-0000-4000-8000-0000000000aa" };
const sheet = { id: "00000000-0000-4000-8000-00000000000b", kind: "document" as const, title: "Notes", assetId: "00000000-0000-4000-8000-0000000000bb" };
const base: ContentDocument = { title: "Lesson", description: "", accessDays: 7, items: [video, sheet] };

it("summarises the first publication", () => {
  expect(revisionChanges(null, base)).toEqual({ headline: "Published with 2 materials", fields: ["Material"], lines: [], details: ["Explanation video “Intro”", "Document “Notes”"] });
});

it("builds a headline, one line per change and itemised details", () => {
  const next: ContentDocument = { ...base, title: "Lesson 1", accessDays: 14, couponTypeId: "00000000-0000-4000-8000-000000000001",
    items: [{ ...sheet, title: "Worksheet" }, { id: "c", kind: "assessment", title: "Quiz", assessmentId: "q", assessmentKind: "quiz" }, video],
    prerequisites: [{ unitId: "u", kind: "quiz", assessmentId: "q0" }] };
  expect(revisionChanges(base, next)).toEqual({
    headline: "Added an assessment, renamed the unit and more",
    fields: ["Title", "Material", "Access", "Coupon", "Requirements"],
    lines: ["Title “Lesson” → “Lesson 1”", "Reordered", "Access 7 → 14 days", "Coupon required", "+1 required submission"],
    details: ["Added assessment “Quiz”", "Renamed document “Notes” → “Worksheet”"],
  });
});

it("joins two changes and reports removals without a spurious reorder", () => {
  expect(revisionChanges(base, { ...base, items: [sheet], description: "New" })).toEqual({
    headline: "Removed a video and updated the description",
    fields: ["Description", "Material"],
    lines: ["Description updated"],
    details: ["Removed video “Intro”"],
  });
  expect(revisionChanges(base, base).headline).toBe("");
});

it("folds draft saves into the publication they led to", () => {
  const mona = { id: "mona" }, omar = { id: "omar" };
  const draft = { ...base, title: "Draft title" }, more = { ...draft, accessDays: 14 };
  const entries = historyEntries(
    [{ kind: "saved", document: more, at: "2026-10-05T00:00:00Z", by: omar }, { kind: "saved", document: draft, at: "2026-10-04T00:00:00Z", by: mona },
      { kind: "saved", document: { ...base, description: "x" }, at: "2026-10-01T12:00:00Z", by: mona }, { kind: "created", document: { ...base, items: [] }, at: "2026-10-01T00:00:00Z", by: mona }],
    [{ revision: 1, document: base, at: "2026-10-02T00:00:00Z", by: omar }],
  );
  expect(entries.map(e => [e.kind, e.creators, e.saves, e.summary?.headline])).toEqual([
    ["draft", [omar, mona], 2, "Renamed the unit and changed access to 14 days"],
    ["published", [mona], 2, "Published with 2 materials"],
  ]);
  expect(historyEntries([{ kind: "saved", document: { bad: true }, at: "2026-10-01T00:00:00Z", by: null }], [])[0].summary).toBeNull();
});

it("keeps a saved draft as its own version, with later saves after it", () => {
  const omar = { id: "omar" };
  const kept = { ...base, title: "Kept" }, later = { ...kept, accessDays: 14 };
  const entries = historyEntries([
    { kind: "saved", document: later, at: "2026-10-04T00:00:00Z", by: omar },
    { kind: "version", document: kept, at: "2026-10-03T00:00:00Z", by: omar },
    { kind: "saved", document: kept, at: "2026-10-02T00:00:00Z", by: omar },
    { kind: "created", document: base, at: "2026-10-01T00:00:00Z", by: omar },
  ], []);
  expect(entries.map(e => [e.kind, e.version, e.summary?.headline])).toEqual([["draft", false, "Changed access to 14 days"], ["draft", true, "Renamed the unit"]]);

  // Undoing back to the kept version leaves nothing newer; publishing it says so.
  const undone = historyEntries([{ kind: "saved", document: kept, at: "2026-10-04T00:00:00Z", by: omar }, { kind: "version", document: kept, at: "2026-10-03T00:00:00Z", by: omar }, { kind: "created", document: base, at: "2026-10-01T00:00:00Z", by: omar }], []);
  expect(undone.map(e => e.version)).toEqual([true]);
  const published = historyEntries([{ kind: "version", document: kept, at: "2026-10-03T00:00:00Z", by: omar }, { kind: "created", document: base, at: "2026-10-01T00:00:00Z", by: omar }], [{ revision: 1, document: kept, at: "2026-10-04T00:00:00Z", by: omar }]);
  expect(published.map(e => e.summary?.headline)).toEqual(["Published the saved draft", "Renamed the unit"]);
});

it("leaves out trailing saves that end where the live publication is", () => {
  const omar = { id: "omar" };
  // jsonb returns keys in its own order; the comparison must not care.
  const stored = Object.fromEntries(Object.entries(base).reverse());
  const entries = historyEntries([{ kind: "saved", document: base, at: "2026-10-03T00:00:00Z", by: omar }, { kind: "saved", document: { ...base, title: "Tried" }, at: "2026-10-02T12:00:00Z", by: omar }],
    [{ revision: 1, document: stored, at: "2026-10-02T00:00:00Z", by: omar }]);
  expect(entries.map(e => e.kind)).toEqual(["published"]);
});

it("credits the publisher of legacy revisions and starts a never-published unit at creation", () => {
  const omar = { id: "omar" }, at = "2026-10-01T00:00:00Z";
  const legacy = historyEntries([], [{ revision: 1, document: base, at, by: omar }]);
  expect(legacy.map(e => [e.creators, e.saves])).toEqual([[[omar], 0]]);
  const fresh = historyEntries([{ kind: "saved", document: { ...base, description: "x" }, at: "2026-10-02T00:00:00Z", by: omar }, { kind: "created", document: { ...base, items: [] }, at, by: omar }], []);
  expect(fresh[0].summary).toEqual({ headline: "Created the unit", fields: ["Description", "Material"], lines: ["Description updated"], details: ["Added video “Intro”", "Added document “Notes”"] });
});

it("labels history times relative to today", () => {
  const now = new Date(2026, 9, 25, 15, 0);
  const at = (d: Date) => d.toISOString();
  expect(historyTime(at(new Date(2026, 9, 25, 3, 21)), now, false)).toMatch(/^Today, /);
  expect(historyTime(at(new Date(2026, 9, 24, 0, 10)), now, false)).toMatch(/^Yesterday, /);
  expect(historyTime(at(new Date(2026, 9, 20, 9, 0)), now, false)).not.toMatch(/2026/);
  expect(historyTime(at(new Date(2025, 11, 30, 9, 0)), now, true)).toMatch(/2025/);
});

it("describes how long ago something happened", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const ago = (ms: number) => timeAgo(new Date(now.getTime() - ms).toISOString(), now);
  expect([ago(10_000), ago(5 * 60_000), ago(3 * 3_600_000), ago(1 * 86_400_000), ago(40 * 86_400_000)]).toEqual(["just now", "5 minutes ago", "3 hours ago", "1 day ago", "1 month ago"]);
});
