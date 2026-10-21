import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildScenario } from "./scenario.mjs";
import { DEFAULTS } from "./scenario.mjs";
import { expectedCounts, verifyRun } from "./verify.mjs";

const RUN = "11111111-2222-4333-8444-555555555555";
const scenario = buildScenario(DEFAULTS);

/** Fake SQL transport answering the verification query with a canned report. */
const fakeRunSql = (report) => async () => [{ result: report }];

function report(counts, extra = {}) {
  return {
    academy_id: RUN,
    counts,
    failures: [],
    baseline_failures: [],
    projections: { staff: { past_sessions: 72 }, student: { my_exams: { items: [{}] } } },
    ...extra,
  };
}

describe("expectedCounts", () => {
  it("matches the default scenario", () => {
    const counts = expectedCounts(scenario);
    const expected = {
      sessions_ended: 72, roster_entries: 360, attendance_publications: 72, attendance_publication_items: 360,
      assignments: 20, assignments_closed: 16, assignment_recipients: 100, exams: 10, exam_closures: 8,
      memberships: 7, student_records: 20,
    };
    for (const [name, value] of Object.entries(expected)) assert.equal(counts[name], value, name);
  });
});

describe("verifyRun", () => {
  it("baseline mode flags a count mismatch and baseline failures", async () => {
    const counts = { ...expectedCounts(scenario), attendance_publications: 71, effects: 0, effects_suppressed: 0 };
    const result = await verifyRun({ runSql: fakeRunSql(report(counts, { baseline_failures: ["sheet missing"] })), runId: RUN, scenario }, "baseline");
    assert.equal(result.ok, false);
    assert.ok(result.problems.includes("attendance_publications: expected 72, found 71"));
    assert.ok(result.problems.includes("sheet missing"));
  });

  it("integrity mode ignores exact counts and baseline failures but reports failures and effect mismatches", async () => {
    const counts = { ...expectedCounts(scenario), attendance_publications: 71, effects: 5, effects_suppressed: 4 };
    const result = await verifyRun({
      runSql: fakeRunSql(report(counts, { failures: ["isolation broke"], baseline_failures: ["sheet missing"] })), runId: RUN, scenario,
    }, "integrity");
    assert.equal(result.ok, false);
    assert.deepEqual(result.problems, ["isolation broke", "effect suppression count differs from effects"]);
  });

  it("rejects an unknown mode", async () => {
    await assert.rejects(verifyRun({ runSql: fakeRunSql(report({})), runId: RUN, scenario }, "other"), /--mode must be baseline or integrity/);
  });
});
