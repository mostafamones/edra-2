import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildScenario, validateScenario } from "./scenario.mjs";
import { expectedCounts } from "./verify.mjs";
import { scenarioHash } from "./registry.mjs";
import { buildChecked, parseArgs } from "./cli.mjs";

const options = { recipeVersion: "edra-dev-v4", referenceDate: "2026-11-27" };
const scenario = buildScenario(options);

describe("300-student statistics recipe", () => {
  it("covers varied groups, profiles, enrollment dates, and dense assessment history", () => {
    assert.equal(scenario.students.length, 300);
    assert.equal(scenario.groups.length, 12);
    assert.deepEqual([...new Set(scenario.groups.map((g) => scenario.placements.filter((p) => p.groupId === g.id).length))], [20, 25, 30]);
    assert.equal(new Set(scenario.students.map((s) => s.profile.tier)).size, 4);
    assert.ok(new Set(scenario.placements.map((p) => p.enrolledAt)).size >= 10);
    assert.equal(scenario.assignments.filter((a) => a.kind === "historical").length, 12 * 14);
    assert.equal(scenario.exams.filter((e) => e.kind === "historical").length, 12 * 7);
    assert.equal(new Set(scenario.assignmentResults.map((r) => r.state)).size, 5);
    assert.equal(expectedCounts(scenario).accounts, 306);
  });

  it("includes exactly the eligible students in every roster and assessment, without pre-enrollment missing work", () => {
    for (const [items, results, dateField, resultField] of [
      [scenario.sessions, scenario.roster, "startsAt", "sessionId"],
      [scenario.assignments, scenario.assignmentResults, "assignedAt", "assignmentId"],
      [scenario.exams.filter((e) => e.kind === "historical"), scenario.examResults, "opensAt", "examId"],
    ]) {
      for (const item of items) {
        const eligible = scenario.placements.filter((p) => (item.groupIds ?? [item.groupId]).includes(p.groupId) && p.enrolledAt <= item[dateField]).map((p) => p.studentId).sort();
        assert.deepEqual(results.filter((r) => r[resultField] === item.id).map((r) => r.studentId).sort(), eligible, item.key);
      }
    }
    const recent = scenario.placements.filter((p) => p.enrolledAt >= "2026-11-22T22:00:00.000Z");
    assert.ok(recent.length > 0);
    assert.ok(recent.every((p) => !scenario.roster.some((r) => r.studentId === p.studentId)));
  });

  it("reproduces runs, varies by seed, and validates across dates and seeds", () => {
    assert.equal(scenarioHash(buildScenario(options)), scenarioHash(scenario));
    for (const [seed, referenceDate] of [["rich-a", "2026-10-21"], ["rich-b", "2026-12-09"], ["rich-c", "2027-02-15"]]) {
      const other = buildScenario({ ...options, seed, referenceDate });
      assert.equal(validateScenario(other).valid, true);
      assert.notEqual(scenarioHash(other), scenarioHash(scenario));
    }
  });

  it("selects counts by recipe and refuses mismatches before cloud access", () => {
    const args = parseArgs(["dry-run", "--recipe", "edra-dev-v4", "--reference-date", "2026-11-27"]);
    assert.equal(buildChecked(args.options, null).students.length, 300);
    assert.throws(() => buildScenario({ ...options, students: 20 }), /requires 300/);
    assert.throws(() => buildScenario({ recipeVersion: "edra-dev-v3", students: 300 }), /requires 20/);
  });

  it("rejects pre-enrollment exam history even when marked missing", () => {
    const changed = structuredClone(scenario);
    const result = changed.examResults[0];
    changed.placements.find((p) => p.studentId === result.studentId).enrolledAt = "2026-11-26T22:00:00.000Z";
    assert.ok(validateScenario(changed).errors.some((e) => e.includes("precedes enrollment")));
  });
});
