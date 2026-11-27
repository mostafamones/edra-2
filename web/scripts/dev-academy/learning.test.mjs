import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildScenario, validateScenario } from "./scenario.mjs";
import { scenarioHash } from "./registry.mjs";

const options = { recipeVersion: "edra-dev-v6", referenceDate: "2026-11-27" };
const scenario = buildScenario(options);

describe("learning recipe (v6)", () => {
  it("seeds around 300 students with exactly 60 online-only", () => {
    for (const seed of ["a", "b", "c", "d"]) {
      const s = buildScenario({ ...options, seed });
      assert.ok(s.students.length >= 280 && s.students.length <= 320);
      assert.equal(s.placements.filter((p) => p.mode === "online-only").length, 60);
      assert.equal(validateScenario(s).valid, true);
    }
    assert.equal(scenarioHash(buildScenario(options)), scenarioHash(scenario));
  });

  it("gives online-only students no group or attendance but online assessment history", () => {
    const online = new Set(scenario.placements.filter((p) => p.mode === "online-only").map((p) => p.studentId));
    assert.ok(scenario.placements.filter((p) => online.has(p.studentId)).every((p) => p.groupId === null));
    assert.ok(!scenario.roster.some((r) => online.has(r.studentId)));
    assert.ok(scenario.assignmentResults.some((r) => online.has(r.studentId) && r.answers.length));
    assert.ok(scenario.examResults.some((r) => online.has(r.studentId) && r.attempt));
  });

  it("builds a varied placeholder library with access and progress", () => {
    const { units, assets, grants, progress } = scenario.library;
    assert.equal(units.length, 20);
    assert.equal(assets.length, units.length);
    assert.deepEqual([...new Set(units.map((u) => u.state))].sort(), ["archived", "draft", "published", "published_edited", "review"]);
    assert.ok(units.some((u) => u.assignmentId));
    assert.ok(grants.some((g) => g.kind === "staff_extension") && grants.some((g) => g.revokedAt));
    const done = progress.filter((p) => p.ranges[0][1] - p.ranges[0][0] >= 0.9 * assets.find((a) => a.id === p.assetId).durationSeconds);
    assert.ok(done.length > 0 && done.length < progress.length);
  });
});
