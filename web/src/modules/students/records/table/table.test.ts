import { describe, expect, it } from "vitest";

import type { StudentRecordRow } from "../types";
import { COLUMN_WIDTHS, DATA_COLUMNS } from "./config";
import { clampTrade, fitWidths } from "./layout";
import { defaultPreferences, moveColumn, preferencesKey, readPreferences, sanitizePreferences } from "./preferences";
import { bulkTargets, pageSelectionState, syncSelection, togglePage, toggleRow } from "./selection";

describe("table preferences", () => {
  it("are scoped by schema version, user, and academy", () => {
    expect(preferencesKey("user-1", "academy-1")).toBe("edra.students.table.v1:user-1:academy-1");
  });

  it("fall back to defaults for missing or malformed storage", () => {
    expect(sanitizePreferences(null)).toEqual(defaultPreferences());
    expect(sanitizePreferences("nope")).toEqual(defaultPreferences());
    expect(readPreferences({ getItem: () => "{not json" }, "key")).toEqual(defaultPreferences());
    expect(readPreferences({ getItem: () => { throw new Error("blocked"); } }, "key")).toEqual(defaultPreferences());
    expect(defaultPreferences().visibility.createdAt).toBe(false);
  });

  it("drops unknown and duplicate columns and appends missing ones", () => {
    const result = sanitizePreferences({ order: ["group", "secret", "name", "group", 7] });
    // The code column, added later, joins at the far left of an older saved layout.
    expect(result.order.slice(0, 3)).toEqual(["code", "group", "name"]);
    expect([...result.order].sort()).toEqual([...DATA_COLUMNS].sort());
  });

  it("clamps widths and ignores unknown or non-numeric widths", () => {
    const result = sanitizePreferences({ sizing: { name: 50, group: 5000, track: "wide", select: 10, level: 233.6 } });
    expect(result.sizing).toEqual({ name: COLUMN_WIDTHS.name.minSize, group: 720, level: 234 });
  });

  it("keeps the name column visible and validates the page size", () => {
    const result = sanitizePreferences({ visibility: { name: false, track: false, phone: false }, pageSize: 25 });
    expect(result.visibility.name).toBe(true);
    expect(result.visibility.track).toBe(false);
    expect(result.pageSize).toBeNull();
    expect(sanitizePreferences({ pageSize: 100 }).pageSize).toBe(100);
  });

  it("moves columns one step and stops at the edges", () => {
    const order = [...DATA_COLUMNS];
    expect(moveColumn(order, "studentPhone", -1).slice(1, 3)).toEqual(["studentPhone", "name"]);
    expect(moveColumn(order, "code", -1)).toBe(order);
    expect(moveColumn(order, "createdAt", 1)).toBe(order);
  });
});

describe("table layout", () => {
  const columns = [{ size: 44, fixed: true }, { size: 200, fixed: false }, { size: 100, fixed: false }, { size: 48, fixed: true }];

  it("fills the available width exactly, keeping fixed columns", () => {
    for (const available of [400, 1000, 1333, 1920]) {
      const { widths } = fitWidths(columns, available);
      expect(widths.reduce((sum, width) => sum + width, 0)).toBe(available);
      expect([widths[0], widths[3]]).toEqual([44, 48]);
    }
    const { widths, scale } = fitWidths(columns, 692);
    expect(widths).toEqual([44, 400, 200, 48]);
    expect(scale).toBe(2);
  });

  it("moves a boundary within both neighbours' limits", () => {
    const left = { size: 200, minSize: 100, maxSize: 300 };
    const right = { size: 150, minSize: 100, maxSize: 720 };
    expect(clampTrade(left, right, 30)).toBe(30);
    expect(clampTrade(left, right, 80)).toBe(50);
    expect(clampTrade(left, right, -500)).toBe(-100);
  });
});

const row = (id: string, version = 1, archived = false): StudentRecordRow => ({
  id, academyStudentProfileId: `p-${id}`, fullName: id, studentPhone: "+201012345678", parentPhone: "+201112223333",
  levelId: "preparatory-3", levelName: "Third Preparatory", trackId: null, trackName: null, primaryGroupId: null, groupName: null,
  participationType: "in_person", archivedAt: archived ? "2030-10-01T00:00:00Z" : null,
  createdAt: "2030-09-01T00:00:00Z", updatedAt: "2030-09-01T00:00:00Z", version,
});

describe("selection", () => {
  const pageOne = [row("a"), row("b")];
  const pageTwo = [row("c", 1, true), row("d")];

  it("selects a page while keeping other pages' selections", () => {
    let selection = togglePage({}, pageOne, true);
    selection = toggleRow(selection, pageTwo[0], true);
    expect(Object.keys(selection).sort()).toEqual(["a", "b", "c"]);
    expect(pageSelectionState(selection, pageOne)).toBe(true);
    expect(pageSelectionState(selection, pageTwo)).toBe("indeterminate");
    selection = togglePage(selection, pageOne, false);
    expect(Object.keys(selection)).toEqual(["c"]);
    expect(pageSelectionState(selection, pageOne)).toBe(false);
  });

  it("splits a mixed selection into archive and restore targets", () => {
    const selection = togglePage(togglePage({}, pageOne, true), pageTwo, true);
    expect(bulkTargets(selection, true).map((target) => target.id).sort()).toEqual(["a", "b", "d"]);
    expect(bulkTargets(selection, false)).toEqual([{ id: "c", version: 1 }]);
  });

  it("refreshes versions of reloaded rows and keeps identity when nothing changed", () => {
    const selection = togglePage({}, pageOne, true);
    expect(syncSelection(selection, pageOne)).toBe(selection);
    const synced = syncSelection(selection, [row("a", 3, true)]);
    expect(synced.a).toEqual({ version: 3, archived: true });
    expect(synced.b).toEqual(selection.b);
  });
});
