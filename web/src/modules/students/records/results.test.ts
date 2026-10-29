import { expect, it } from "vitest";
import { announcedResults, type StudentResult } from "./results";

const result = (id: string, total = "8", maximum = "10", date = "2026-10-29T12:00:00Z"): StudentResult => ({
  id, title: id, kind: "assignment", publication: { total, max_score: maximum, published_at: date },
});

it("charts announced zero but excludes private, missing and incompatible results", () => {
  const points = announcedResults([
    result("zero", "0"), { ...result("private"), publication: null },
    { ...result("quiz"), kind: "quiz" }, result("missing", ""),
    result("invalid maximum", "8", "0"), result("invalid date", "8", "10", "invalid"),
  ], "assignment");
  expect(points.map(point => [point.id, point.percent])).toEqual([["zero", 0]]);
});

it("takes the latest eight announced snapshots and orders them chronologically without changing the input", () => {
  const rows = Array.from({ length: 10 }, (_, day) => result(String(day), "8", "10", `2026-10-${String(day + 1).padStart(2, "0")}T12:00:00Z`)).reverse();
  const before = rows.map(row => row.id);
  expect(announcedResults(rows, "assignment").map(point => point.id)).toEqual(["2", "3", "4", "5", "6", "7", "8", "9"]);
  expect(rows.map(row => row.id)).toEqual(before);
});
