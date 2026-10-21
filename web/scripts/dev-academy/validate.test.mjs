import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildScenario } from "./scenario.mjs";
import { validateScenario } from "./validate.mjs";

const clone = (value) => structuredClone(value);

describe("S4 references, placement, timing and scores", () => {
  it("accepts the default scenario", () => {
    const result = validateScenario(buildScenario());
    assert.deepEqual(result.errors, []);
    assert.equal(result.valid, true);
  });

  it("rejects a total that no longer equals its component marks", () => {
    const scenario = clone(buildScenario());
    const result = scenario.assignmentResults.find((r) => r.total !== null);
    result.total = result.total + 1;
    const check = validateScenario(scenario);
    assert.equal(check.valid, false);
    assert.match(check.errors.join("\n"), /does not equal the component sum/);
  });

  it("rejects a roster entry that points at a student from another group", () => {
    const scenario = clone(buildScenario());
    const entry = scenario.roster[0];
    const outsider = scenario.placements.find((p) => p.groupId !== scenario.placements.find((x) => x.studentId === entry.studentId).groupId);
    entry.studentId = outsider.studentId;
    assert.match(validateScenario(scenario).errors.join("\n"), /outside the session group/);
  });

  it("rejects an event that precedes enrollment", () => {
    const scenario = clone(buildScenario());
    const result = scenario.assignmentResults.find((r) => r.receivedAt !== null);
    const placement = scenario.placements.find((p) => p.studentId === result.studentId);
    placement.enrolledAt = "2026-10-01T00:00:00.000Z";
    assert.match(validateScenario(scenario).errors.join("\n"), /precedes enrollment/);
  });

  it("rejects a result announced on the reference date", () => {
    const scenario = clone(buildScenario());
    const result = scenario.assignmentResults.find((r) => r.announcedAt !== null);
    result.announcedAt = "2026-10-21T10:00:00.000Z";
    assert.match(validateScenario(scenario).errors.join("\n"), /on or after the reference date/);
  });

  it("requires the open exam to stay open through the reference date", () => {
    const scenario = clone(buildScenario());
    scenario.exams.find((e) => e.kind === "open").closesAt = "2026-10-21T17:00:00.000Z";
    assert.match(validateScenario(scenario).errors.join("\n"), /stay open through the reference date/);
  });
});
