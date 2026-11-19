import assert from "node:assert/strict";
import { test } from "node:test";

import { students } from "../../fixtures/index.ts";
import { announceable, visibleStudents, workspacePanes } from "./workspaceModel.ts";

test("scan pane needs marking access and codes, and leaves while selecting", () => {
  const ok = { canMark: true, codesEnabled: true };
  assert.equal(workspacePanes(ok, false, true).scan, true);
  assert.equal(workspacePanes(ok, true, true).scan, false);
  assert.equal(workspacePanes({ ...ok, codesEnabled: false }, false, true).scan, false);
  assert.equal(workspacePanes({ ...ok, canMark: false }, false, true).scan, false);
});

test("announce moves to the navigation bar only without a search tab", () => {
  const ok = { canMark: true, codesEnabled: true };
  assert.deepEqual(workspacePanes(ok, true, true), { scan: false, searchTab: true, toolbarAnnounce: false });
  assert.deepEqual(workspacePanes(ok, true, false), { scan: false, searchTab: false, toolbarAnnounce: true });
  assert.equal(workspacePanes(ok, false, false).toolbarAnnounce, false);
});

test("filters and search combine; unannounced means saved but not announced", () => {
  assert.equal(visibleStudents(students, "All", "").length, students.length);
  assert.ok(visibleStudents(students, "Unannounced", "").every(announceable));
  assert.deepEqual(visibleStudents(students, "All", "e-1041").map((s) => s.id), ["st2"]);
  assert.deepEqual(visibleStudents(students, "Not received", "omar"), []);
});
