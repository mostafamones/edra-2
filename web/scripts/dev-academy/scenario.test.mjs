import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { scenarioHash } from "./registry.mjs";
import { buildScenario } from "./scenario.mjs";
import { cairoToUtcMs } from "./time.mjs";

const scenario = buildScenario();
const count = (list, predicate = () => true) => list.filter(predicate).length;

describe("S1 default counts match the README recipe", () => {
  it("builds 20 students, 4 groups of 5, and 6 generated staff plus the owner placeholder", () => {
    assert.equal(scenario.students.length, 20);
    assert.equal(scenario.groups.length, 4);
    for (const group of scenario.groups) {
      assert.equal(count(scenario.placements, (p) => p.groupId === group.id), 5);
    }
    assert.equal(count(scenario.staff, (s) => !s.placeholder), 6);
    assert.equal(count(scenario.staff, (s) => s.placeholder), 1);
    assert.ok(scenario.placements.every((p) => p.mode === "in-person"));
  });

  it("builds 9 teaching weeks, 72 sessions, 360 roster entries, 72 publications with 360 items", () => {
    assert.equal(scenario.config.teachingWeeks.count, 9);
    assert.equal(scenario.config.teachingWeeks.firstStartsOn, "2026-08-17");
    assert.equal(scenario.config.teachingWeeks.lastEndsOn, "2026-10-18");
    assert.equal(scenario.sessions.length, 72);
    assert.ok(scenario.sessions.every((s) => s.status === "ended"));
    assert.equal(scenario.roster.length, 360);
    assert.equal(scenario.attendancePublications.length, 72);
    assert.equal(scenario.attendancePublications.reduce((n, p) => n + p.items.length, 0), 360);
  });

  it("builds 4 schedules with 2 slots each", () => {
    assert.equal(scenario.schedules.length, 4);
    assert.ok(scenario.schedules.every((s) => s.slots.length === 2));
  });

  it("builds 16 historical + 4 current assignments and 8 historical + 1 open + 1 upcoming exams", () => {
    assert.equal(count(scenario.assignments, (a) => a.kind === "historical"), 16);
    assert.equal(count(scenario.assignments, (a) => a.kind === "current"), 4);
    assert.equal(count(scenario.exams, (e) => e.kind === "historical"), 8);
    assert.equal(count(scenario.exams, (e) => e.kind === "open"), 1);
    assert.equal(count(scenario.exams, (e) => e.kind === "upcoming"), 1);
  });
});

describe("S2 determinism", () => {
  it("produces byte-identical JSON for identical inputs", () => {
    assert.equal(JSON.stringify(buildScenario()), JSON.stringify(scenario));
  });

  it("changes names and attendance events when the seed changes", () => {
    const other = buildScenario({ seed: "edra-20-v2" });
    assert.notDeepEqual(other.students.map((s) => s.displayName), scenario.students.map((s) => s.displayName));
    const statuses = (s) => s.attendancePublications.flatMap((p) => p.items.map((i) => i.status)).join(",");
    assert.notEqual(statuses(other), statuses(scenario));
  });
});

describe("edra-dev-v1 compatibility", () => {
  // Captured before edra-dev-v2 existed; the registered development run was created from the first hash.
  it("rebuilds the registered v1 scenarios byte for byte", () => {
    assert.equal(scenarioHash(buildScenario({ recipeVersion: "edra-dev-v1" })), "b25cf643746ed25297cdace5a893bbfcccbe2c104fc65b8f15a4890627360ba8");
    assert.equal(
      scenarioHash(buildScenario({ recipeVersion: "edra-dev-v1", seed: "edra-20-v2", referenceDate: "2026-12-09" })),
      "84298de595c829a16900dccf17fb859a1605e81e4abf8d5923066d0bc65e3cb9",
    );
  });

  it("has five students per v1 pattern, all four patterns present", () => {
    const v1 = buildScenario({ recipeVersion: "edra-dev-v1" });
    for (const pattern of ["consistent", "improving", "temporary-dip", "irregular"]) {
      assert.equal(count(v1.students, (s) => s.pattern === pattern), 5, pattern);
    }
  });

  it("refuses unknown recipe identifiers", () => {
    assert.throws(() => buildScenario({ recipeVersion: "edra-dev-v3" }), /Unknown recipe "edra-dev-v3"/);
    assert.throws(() => buildScenario({ recipeVersion: "toString" }), /Unknown recipe/);
  });
});

describe("S5 current assignment cases", () => {

  it("gives each current assignment all five states, rotated across groups", () => {
    const states = ["missing", "received_unmarked", "marked_private", "announced", "late_announced"];
    const current = scenario.assignments.filter((a) => a.kind === "current");
    assert.equal(current.length, 4);
    const firstStateByGroup = new Set();
    for (const assignment of current) {
      const rows = scenario.assignmentResults.filter((r) => r.assignmentId === assignment.id);
      assert.deepEqual([...new Set(rows.map((r) => r.state))].sort(), [...states].sort());
      firstStateByGroup.add(rows[0].state);
    }
    assert.equal(firstStateByGroup.size, 4, "first student of each group starts in a different state");
  });
});

describe("Cairo date conversion", () => {
  it("uses the real zone offset for each date (summer +03, winter +02)", () => {
    assert.equal(new Date(cairoToUtcMs("2026-08-17", "16:00")).toISOString(), "2026-08-17T13:00:00.000Z");
    assert.equal(new Date(cairoToUtcMs("2026-11-03", "16:00")).toISOString(), "2026-11-03T14:00:00.000Z");
  });
});

describe("insufficient history", () => {
  it("fails clearly when the reference date has no complete teaching week", () => {
    assert.throws(() => buildScenario({ referenceDate: "2026-08-20" }), /insufficient history/i);
  });

  it("rejects an invalid reference date and a student count other than 20", () => {
    assert.throws(() => buildScenario({ referenceDate: "2026-02-30" }), RangeError);
    assert.throws(() => buildScenario({ students: 21 }), RangeError);
  });
});
