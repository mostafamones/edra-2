import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildScenario, validateScenario } from "./scenario.mjs";
import { scenarioHash } from "./registry.mjs";
import { expectedCounts } from "./verify.mjs";

const inputs = { recipeVersion: "edra-dev-v5", referenceDate: "2026-11-27" };
const scenario = buildScenario(inputs);
const online = scenario.examResults.filter((r) => r.attempt);

describe("answer-level statistics fixtures", () => {
  it("keeps v4 reproducible and generates deterministic answer histories", () => {
    assert.equal(scenarioHash(buildScenario({ recipeVersion: "edra-dev-v4", referenceDate: inputs.referenceDate })), "8c5d5cb891c81cb8b4420ad9aecc3daae756fa7361de269c12e362dc873d69f1");
    assert.equal(scenarioHash(scenario), scenarioHash(buildScenario(inputs)));
    assert.notEqual(scenarioHash(scenario), scenarioHash(buildScenario({ ...inputs, seed: "answers-b" })));
  });

  it("has correct, wrong and blank choices, all distractor letters, zeros and partial written credit", () => {
    const answers = [...scenario.assignmentResults, ...online].flatMap((r) => r.answers ?? []);
    const choices = answers.filter((a) => !a.quality);
    assert.ok(choices.some((a) => a.score > 0));
    assert.ok(choices.some((a) => a.choice !== null && a.score === 0));
    assert.ok(choices.some((a) => a.choice === null && a.score === 0));
    assert.ok(new Set(choices.map((a) => a.choice).filter(Boolean)).size >= 4);
    for (const quality of ["complete", "partial", "incorrect", "blank"]) {
      assert.ok(online.some((r) => r.answers.some((a) => a.quality === quality)), quality);
    }
    assert.ok(online.some((r) => r.answers.some((a) => a.quality === "partial" && a.score > 0)));
  });

  it("provides submitted, partial, private and announced work without treating unmarked answers as zero", () => {
    for (const state of ["received_unmarked", "partially_marked", "marked_private", "announced"]) {
      assert.ok(online.some((r) => r.state === state), state);
    }
    assert.ok(scenario.assignmentResults.some((r) => r.state === "partially_marked"));
    assert.ok(online.some((r) => r.attempt.reason === "timer"));
    assert.ok(online.some((r) => r.attempt.reason === "submitted"));
    for (const r of online.filter((r) => ["received_unmarked", "partially_marked"].includes(r.state))) {
      assert.equal(r.total, null);
      assert.equal(r.announcedAt, null);
      assert.ok(r.answers.some((a) => a.score === null));
    }
    const counts = expectedCounts(scenario);
    assert.equal(counts.exam_attempts, online.length);
    assert.ok(counts.assignment_answers > 10000);
    assert.ok(counts.exam_online_answers > 1000);
    assert.equal(counts.assignment_derived_marks, counts.assignment_marks);
    const manualMarks = online.reduce((n, r) => n + r.answers.filter((a) => a.quality && a.score !== null).length, 0);
    const paperMarks = scenario.examResults.filter((r) => !r.attempt).reduce((n, r) => n + (r.components?.length ?? 0), 0);
    assert.equal(counts.exam_marks, manualMarks + paperMarks);
  });

  it("retains late-joiner eligibility for every answer and attempt", () => {
    const joined = new Map(scenario.placements.map((p) => [p.studentId, p.enrolledAt]));
    for (const r of [...scenario.assignmentResults, ...scenario.examResults]) {
      const assessment = r.assignmentId ? scenario.assignments.find((a) => a.id === r.assignmentId) : scenario.exams.find((e) => e.id === r.examId);
      assert.ok(joined.get(r.studentId) <= (assessment.assignedAt ?? assessment.opensAt));
      if (!r.receivedAt) assert.equal(r.answers?.length ?? 0, 0);
    }
    assert.equal(validateScenario(scenario).valid, true);
  });

  it("rejects mismatched choices, part totals, incomplete publications and invalid attempt times", () => {
    const tamper = (change, pattern) => {
      const changed = structuredClone(scenario);
      change(changed);
      assert.ok(validateScenario(changed).errors.some((e) => pattern.test(e)), pattern.source);
    };
    tamper((s) => { s.assignmentResults.find((r) => r.answers.some((a) => a.choice)).answers.find((a) => a.choice).choice = "J"; }, /unknown answer choice/);
    tamper((s) => { s.assignmentResults.find((r) => r.components?.length).components[0].score += 1; }, /part mark differs/);
    tamper((s) => { s.examResults.find((r) => r.state === "partially_marked").announcedAt = "2026-10-01T00:00:00Z"; }, /partial marking/);
    tamper((s) => { s.examResults.find((r) => r.attempt).attempt.deadlineAt = "2026-08-16T00:00:00Z"; }, /attempt timeline/);
  });

  it("validates other seeds and academic-year dates", () => {
    for (const [seed, referenceDate] of [["answers-c", "2026-10-21"], ["answers-d", "2027-02-15"]]) {
      assert.equal(validateScenario(buildScenario({ ...inputs, seed, referenceDate })).valid, true);
    }
  });
});
