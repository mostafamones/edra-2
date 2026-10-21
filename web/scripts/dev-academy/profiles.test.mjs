import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assessmentMaxima } from "./cli.mjs";
import { buildScenario } from "./scenario.mjs";

const SEEDS = ["edra-20-v1", "edra-20-v2", "profile-check"];
const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
const sd = (list) => Math.sqrt(mean(list.map((x) => (x - mean(list)) ** 2)));

/** Realised per-student outcomes; marks are percentages of each assessment's maximum. */
function outcomes(scenario) {
  const maxOf = assessmentMaxima(scenario);
  const weekOf = new Map([...scenario.assignments, ...scenario.exams].map((x) => [x.id, x.week]));
  const items = scenario.attendancePublications.flatMap((p) => p.items);
  return scenario.students.map((s) => {
    const mine = items.filter((i) => i.studentId === s.id);
    const marks = [...scenario.assignmentResults, ...scenario.examResults]
      .filter((r) => r.studentId === s.id && r.total !== null)
      .map((r) => ({ week: weekOf.get(r.assignmentId ?? r.examId), total: (100 * r.total) / maxOf.get(r.assignmentId ?? r.examId) }));
    const totals = marks.map((m) => m.total);
    return {
      ...s.profile,
      trajectory: s.pattern,
      attended: mine.filter((i) => i.status === "present" || i.status === "late").length / mine.length,
      marks,
      totals,
      avg: mean(totals),
    };
  });
}

// v3 keeps the v2 student model; its marks are compared as percentages of varied maxima.
for (const recipeVersion of ["edra-dev-v2", "edra-dev-v3"]) {
  const all = SEEDS.map((seed) => outcomes(buildScenario({ recipeVersion, seed })));

  describe(`${recipeVersion} student profiles`, () => {
    it("is repeatable for the same inputs and differs by seed", () => {
      const options = { recipeVersion, seed: "edra-20-v2" };
      assert.equal(JSON.stringify(buildScenario(options)), JSON.stringify(buildScenario(options)));
      assert.notDeepEqual(all[0].map((s) => s.ability), all[1].map((s) => s.ability));
    });

    it("builds valid scenarios with short and long histories", () => {
      for (const referenceDate of ["2026-08-24", "2026-08-31", "2026-09-14", "2027-03-01"]) {
        assert.doesNotThrow(() => buildScenario({ recipeVersion, seed: "short", referenceDate }), referenceDate);
      }
    });

    for (const [i, students] of all.entries()) {
      describe(`seed ${SEEDS[i]}`, () => {
        it("has consistent top achievers and distinct strong, middle and struggling students", () => {
          const consistentTop = students.filter((s) => s.trajectory === "steady" && s.totals.length && Math.min(...s.totals) >= 85 && s.avg >= 90);
          assert.ok(consistentTop.length >= 2, `consistent top achievers: ${consistentTop.length}`);
          assert.ok(students.some((s) => s.tier === "middle" && s.avg > 60 && s.avg < 78));
          assert.ok(students.some((s) => s.tier === "struggling" && s.avg < 60));
          for (const tier of ["top", "strong", "middle", "struggling"]) {
            const abilities = students.filter((s) => s.tier === tier).map((s) => s.ability);
            assert.ok(new Set(abilities).size > 1, `${tier} abilities vary between students`);
          }
        });

        it("keeps attendance habits independent of ability", () => {
          assert.ok(students.some((s) => s.tier === "top" && s.attendance === "patchy" && s.attended < 0.85 && s.avg >= 88));
          assert.ok(students.some((s) => s.tier === "struggling" && s.attendance === "reliable" && s.attended >= 0.85 && s.avg < 62));
        });

        it("keeps a recognisable identity: steady students vary far less than students differ", () => {
          const steady = students.filter((s) => s.trajectory === "steady" && s.totals.length >= 2);
          assert.ok(mean(steady.map((s) => sd(s.totals))) * 3 < sd(students.filter((s) => s.totals.length).map((s) => s.avg)));
        });
      });
    }

    it("shows improvement and temporary setbacks", () => {
      const students = all.flat();
      const gain = (s) => {
        const half = Math.max(0, ...s.marks.map((m) => m.week)) / 2;
        const early = s.marks.filter((m) => m.week <= half).map((m) => m.total);
        const late = s.marks.filter((m) => m.week > half).map((m) => m.total);
        return early.length && late.length ? mean(late) - mean(early) : null;
      };
      const gains = students.filter((s) => s.trajectory === "improving").map(gain).filter((g) => g !== null);
      assert.ok(mean(gains) > 6, `mean improving gain ${mean(gains)}`);
      const drop = (s) => s.avg - Math.min(...s.totals);
      const dips = students.filter((s) => s.trajectory === "temporary-dip" && s.totals.length);
      const steady = students.filter((s) => s.trajectory === "steady" && s.totals.length);
      assert.ok(mean(dips.map(drop)) > 2 * mean(steady.map(drop)), "dip students fall well below their own average");
    });
  });
}
