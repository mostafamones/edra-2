// Read-only `inspect` and `verify` for a registered run. Baseline mode expects the exact initial
// scenario; integrity mode accepts legitimate later edits (new work, corrections) and checks only
// references, official history, isolation and effect suppression.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { uuid } from "./registry.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const MODES = new Set(["baseline", "integrity"]);

/** Exact initial counts implied by a scenario. */
export function expectedCounts(scenario) {
  const received = (r) => r.receivedAt !== null;
  const announced = (r) => r.state === "announced" || r.state === "late_announced";
  const items = scenario.attendancePublications.flatMap((p) => p.items);
  return {
    accounts: 26, accounts_loaded: 26, auth_users: 26, years: 1, open_years: 1,
    memberships: scenario.staff.length, groups: scenario.groups.length, schedules: scenario.schedules.length,
    schedule_slots: scenario.schedules.reduce((n, s) => n + s.slots.length, 0),
    student_records: scenario.students.length, linked_records: scenario.students.length,
    sessions_ended: scenario.sessions.length, sessions_live: 0, roster_entries: scenario.roster.length,
    attendance_sheets: scenario.attendancePublications.length, attendance_publications: scenario.attendancePublications.length,
    attendance_publication_items: items.length, attendance_records: items.length,
    attendance_effects: items.filter((i) => ["present", "late", "absent"].includes(i.status)).length,
    assignments: scenario.assignments.length, assignments_closed: scenario.assignments.filter((a) => a.kind === "historical").length,
    assignment_recipients: scenario.assignmentResults.length,
    assignment_marks: scenario.assignmentResults.reduce((n, r) => n + (r.components?.length ?? 0), 0),
    assignment_publications: scenario.assignmentResults.filter(announced).length,
    exams: scenario.exams.length, exam_closures: scenario.exams.filter((e) => e.kind === "historical").length,
    exam_work: scenario.examResults.filter(received).length, exam_submissions: scenario.examResults.filter(received).length,
    exam_marks: scenario.examResults.reduce((n, r) => n + (r.components?.length ?? 0), 0),
    exam_publications: scenario.examResults.filter((r) => r.state === "announced").length,
  };
}

export async function verificationReport(runSql, runId) {
  const sql = `begin read only;
select set_config('edra.dev_run', '${uuid(runId)}', true);
${readFileSync(join(HERE, "sql/verify.sql"), "utf8")}
rollback;`;
  const rows = await runSql(sql);
  return rows[0]?.result;
}

/** Returns {ok, problems, report}; never writes. */
export async function verifyRun(ctx, mode) {
  if (!MODES.has(mode)) throw new Error("--mode must be baseline or integrity.");
  const report = await verificationReport(ctx.runSql, ctx.runId);
  if (!report) return { ok: false, problems: ["run is not registered"], report: null };
  const problems = [...report.failures];
  const counts = report.counts;
  if (counts.effects !== counts.effects_suppressed) problems.push("effect suppression count differs from effects");
  if (report.projections?.staff?.past_sessions !== Math.min(counts.sessions_ended, 100)) problems.push("past sessions projection is incomplete");
  if (!report.projections?.student?.my_exams?.items?.length) problems.push("student exam projection is empty");
  if (mode === "baseline") {
    problems.push(...report.baseline_failures);
    for (const [name, value] of Object.entries(expectedCounts(ctx.scenario))) {
      if (counts[name] !== value) problems.push(`${name}: expected ${value}, found ${counts[name]}`);
    }
  }
  return { ok: problems.length === 0, problems, report };
}
