import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { COURSES } from "./assessments.mjs";
import { cplusplus } from "./bank/cpp.mjs";
import { foundations } from "./bank/foundations.mjs";
import { javascript } from "./bank/javascript.mjs";
import { assessmentMaxima } from "./cli.mjs";
import { buildScenario } from "./scenario.mjs";

const PACKS = [foundations, javascript, cplusplus];
const questionsOf = (assessment) => assessment.parts.flatMap((part) => part.questions.map((q) => ({ ...q, kind: part.kind })));
const bankItems = (pack) => [
  ...(pack.assignments.flat ? pack.assignments.flat() : pack.assignments).flatMap(questionsOf),
  ...(pack.paperExams ?? []).flatMap(questionsOf),
  ...(pack.practiceExam ? questionsOf(pack.practiceExam) : []),
];
const runnable = (pack) => bankItems(pack).filter((q) => q.output !== undefined || q.prints);
const expected = (q) => (q.prints ? q.choices[0] : q.output);

describe("question bank", () => {
  it("has unique assessment ids and positive whole-mark questions", () => {
    const ids = PACKS.flatMap((pack) => [...pack.assignments.flat(), ...(pack.paperExams ?? []), ...(pack.practiceExam ? [pack.practiceExam] : [])].map((a) => a.id));
    assert.equal(new Set(ids).size, ids.length);
    for (const pack of PACKS) {
      for (const q of bankItems(pack)) assert.ok(Number.isInteger(q.marks) && q.marks > 0, q.prompt);
    }
  });

  it("gives every choice question one correct first choice and distinct, non-empty distractors", () => {
    for (const pack of PACKS) {
      for (const q of bankItems(pack).filter((item) => item.choices)) {
        assert.ok(q.choices.length >= 3 && q.choices.length <= 10, q.prompt);
        assert.equal(new Set(q.choices).size, q.choices.length, q.prompt);
        assert.ok(q.choices.every((c) => c.trim() === c && c !== ""), q.prompt);
        assert.ok(q.explanation, `${q.prompt} has an explanation`);
        // A printed-output question has exactly one choice equal to the real output.
        if (q.prints) assert.equal(q.choices.filter((c) => c === q.output || c === q.choices[0]).length, 1);
      }
    }
  });

  it("never shows a model answer or explanation inside a prompt", () => {
    for (const pack of PACKS) {
      for (const q of bankItems(pack)) {
        for (const secret of [q.answer, q.explanation].filter(Boolean)) assert.ok(!q.prompt.includes(secret) && !(q.code ?? "").includes(secret));
      }
    }
  });

  it("keeps code readable as plain text: no image tokens or tabs", () => {
    for (const pack of PACKS) {
      for (const q of bankItems(pack)) assert.doesNotMatch(`${q.prompt}${q.code ?? ""}`, /\{\{|\t/);
    }
  });

  it("prints exactly the recorded output for every runnable JavaScript snippet (Node.js)", () => {
    const items = runnable(javascript);
    assert.ok(items.length >= 40, `${items.length} JavaScript snippets`);
    for (const q of items) {
      const result = spawnSync(process.execPath, ["--input-type=commonjs", "-e", q.code], { encoding: "utf8", env: {}, timeout: 5000 });
      assert.equal(result.status, 0, `${q.code}\n${result.stderr}`);
      assert.equal(result.stdout, expected(q) ? `${expected(q)}\n` : "", q.code);
    }
  });

  const compiler = ["g++", "clang++"].find((name) => spawnSync(name, ["--version"]).status === 0);
  it("compiles every runnable C++ program as C++17 without warnings and prints the recorded output", { skip: compiler ? false : "no C++ compiler installed" }, () => {
    const dir = mkdtempSync(join(tmpdir(), "edra-bank-"));
    try {
      for (const [i, q] of runnable(cplusplus).entries()) {
        const source = join(dir, `q${i}.cpp`);
        const binary = join(dir, `q${i}`);
        writeFileSync(source, q.code);
        const build = spawnSync(compiler, ["-std=c++17", "-Wall", "-Wextra", "-pedantic", "-Werror", source, "-o", binary], { encoding: "utf8" });
        assert.equal(build.status, 0, `${q.code}\n${build.stderr}`);
        const run = spawnSync(binary, { encoding: "utf8", timeout: 5000 });
        assert.equal(run.stdout, expected(q) ? `${expected(q)}\n` : "", q.code);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes every runnable C++ snippet as a complete program", () => {
    const items = runnable(cplusplus);
    assert.ok(items.length >= 35, `${items.length} C++ programs`);
    for (const q of items) assert.match(q.code, /^#include <iostream>[\s\S]*\nint main\(\) \{\n[\s\S]*\n {2}return 0;\n\}$/);
  });
});

describe("edra-dev-v3 assessments", () => {
  const scenario = buildScenario({ recipeVersion: "edra-dev-v3" });
  const maxOf = assessmentMaxima(scenario);
  const groupLevel = new Map(scenario.groups.map((g) => [g.id, g.levelKey]));

  it("varies maxima, question counts and part weights", () => {
    const assignmentMaxima = new Set(scenario.assignments.map((a) => maxOf.get(a.id)));
    const examMaxima = new Set(scenario.exams.map((e) => maxOf.get(e.id)));
    assert.ok(assignmentMaxima.size >= 5, [...assignmentMaxima].join("/"));
    assert.ok(examMaxima.size >= 5, [...examMaxima].join("/"));
    assert.ok(assignmentMaxima.has(10) && examMaxima.has(100));
    assert.ok(new Set(scenario.assignments.map((a) => a.parts.reduce((n, p) => n + p.questions.length, 0))).size >= 3);
    assert.ok(new Set(scenario.exams.map((e) => e.questions.length)).size >= 3);
    assert.ok(scenario.assignments.some((a) => a.parts[0].maxScore !== a.parts[1]?.maxScore), "unequal part weights");
  });

  it("follows each level's course in order, starting with Programming Foundations", () => {
    for (const group of scenario.groups) {
      const mine = scenario.assignments.filter((a) => a.groupId === group.id);
      assert.equal(mine[0].pack, "foundations");
      assert.ok(mine.slice(1).every((a) => a.pack === COURSES[group.levelKey].id));
      const units = Object.values(COURSES[group.levelKey].units);
      const order = mine.slice(1).map((a) => units.indexOf(a.unit));
      assert.deepEqual(order, [...order].sort((a, b) => a - b), `${group.key} units progress`);
      const exams = scenario.exams.filter((e) => e.kind === "historical" && e.groupIds[0] === group.id).map((e) => e.title);
      assert.match(exams[0], /^Unit test 1: /);
      assert.match(exams[1], /^Unit test 2: /);
    }
  });

  it("selects variants by key: the same group can differ between seeds", () => {
    const titles = (seed) => buildScenario({ recipeVersion: "edra-dev-v3", seed }).assignments.map((a) => a.title).join("|");
    assert.equal(titles("edra-20-v1"), scenario.assignments.map((a) => a.title).join("|"));
    assert.ok(new Set(["a", "b", "c", "d"].map(titles)).size > 1);
  });

  it("makes the open exam fully automatic and the upcoming exam mixed, with shuffled correct answers", () => {
    const open = scenario.exams.find((e) => e.kind === "open");
    const upcoming = scenario.exams.find((e) => e.kind === "upcoming");
    assert.equal(open.pack, "javascript");
    assert.ok(open.groupIds.every((id) => groupLevel.get(id) === "preparatory-3"));
    assert.deepEqual(open.parts.map((p) => p.kind), ["question_sheet"]);
    assert.equal(upcoming.pack, "cpp");
    assert.deepEqual(upcoming.parts.map((p) => p.kind), ["question_sheet", "written_work"]);
    const letters = [...open.questions, ...upcoming.questions].filter((q) => q.choices).map((q) => q.correctChoice);
    assert.ok(new Set(letters).size >= 3, `correct letters ${letters.join("")}`);
    for (const exam of [open, upcoming]) {
      for (const q of exam.questions) assert.ok(q.modelAnswer && !q.prompt.includes(q.modelAnswer));
    }
    assert.equal(scenario.examResults.filter((r) => r.examId === open.id || r.examId === upcoming.id).length, 0, "no fabricated online work");
  });

  it("keeps paper exams and assignments as hand-marked written work with exact, bounded half-mark totals", () => {
    for (const e of scenario.exams.filter((x) => x.kind === "historical")) assert.ok(e.parts.every((p) => p.kind === "written_work"));
    for (const a of scenario.assignments) assert.ok(a.parts.every((p) => p.kind === "file_upload" && p.maxScore === p.questions.reduce((n, q) => n + q.maxScore, 0)));
    for (const r of [...scenario.assignmentResults, ...scenario.examResults].filter((x) => x.total !== null)) {
      const max = maxOf.get(r.assignmentId ?? r.examId);
      assert.ok(r.total >= 0 && r.total <= max, r.key);
      assert.equal(r.total, r.components.reduce((n, c) => n + c.score, 0));
      assert.ok(r.components.every((c) => Number.isInteger(c.score * 2)), `${r.key} half marks`);
    }
  });

  it("revises the course with valid content when the history outgrows it", () => {
    const long = buildScenario({ recipeVersion: "edra-dev-v3", referenceDate: "2027-03-01" });
    assert.ok(long.assignments.some((a) => / \(revision 1\)$/.test(a.title)));
    assert.ok(long.exams.some((e) => / \(revision 1\)$/.test(e.title)));
  });
});
