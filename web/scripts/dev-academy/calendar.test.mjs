import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FRIDAY, calendarProblems, weekPosition } from "./calendar.mjs";
import { buildScenario } from "./scenario.mjs";
import { cairoDate, cairoWeekday } from "./time.mjs";

const scenario = buildScenario({ recipeVersion: "edra-dev-v7", students: 300, referenceDate: "2026-11-28" });
const recurring = scenario.schedules.filter((s) => s.kind === "recurring");
const oneOffs = scenario.schedules.filter((s) => s.kind === "one_off");
const kindOf = new Map(scenario.schedules.map((s) => [s.id, s.kind]));

describe("edra-dev-v7 calendar", () => {
  it("runs Sunday-first weeks through the day before the reference date", () => {
    assert.equal(cairoWeekday(`${scenario.config.teachingWeeks.firstStartsOn}T12:00:00Z`), 7);
    const days = scenario.sessions.map((s) => cairoDate(s.startsAt)).sort();
    assert.equal(days.at(-1), "2026-11-27");
    assert.equal(scenario.config.teachingWeeks.lastEndsOn, "2026-11-27");
  });

  it("never overlaps two sessions in the hall", () => {
    assert.deepEqual(calendarProblems(scenario.sessions.map((s) => ({ ...s, recurring: kindOf.get(s.scheduleId) === "recurring" })), cairoWeekday), []);
  });

  it("keeps Friday free of regular classes and varies frequency and start times", () => {
    assert.ok(recurring.every((s) => s.slots.every((slot) => slot.weekday !== FRIDAY)));
    assert.ok(scenario.sessions.filter((s) => kindOf.get(s.scheduleId) === "recurring").every((s) => cairoWeekday(s.startsAt) !== FRIDAY));
    const counts = new Set(recurring.map((s) => s.slots.length));
    assert.deepEqual([...counts].sort(), [1, 2]);
    assert.ok(new Set(recurring.flatMap((s) => s.slots.map((slot) => slot.startTime))).size >= 5);
    assert.ok(recurring.some((s) => s.slots.some((slot) => slot.weekday === 6)), "Saturday is a teaching day");
    for (const s of recurring.filter((x) => x.slots.length === 2)) {
      assert.ok(Math.abs(weekPosition(s.slots[0].weekday) - weekPosition(s.slots[1].weekday)) >= 2, s.key);
    }
  });

  it("makes up each skipped session on the first Friday after it, with no session on the skipped date", () => {
    const makeUps = oneOffs.filter((s) => s.skippedOn);
    assert.ok(makeUps.length >= 3);
    for (const s of makeUps) {
      const date = s.occurrences[0].date;
      assert.equal(cairoWeekday(`${date}T12:00:00Z`), FRIDAY);
      assert.ok(date > s.skippedOn && Date.parse(date) - Date.parse(s.skippedOn) <= 7 * 86_400_000, s.key);
      const groupDays = scenario.sessions.filter((x) => x.groupId === s.groupId).map((x) => cairoDate(x.startsAt));
      assert.ok(!groupDays.includes(s.skippedOn), `${s.key} skipped session still exists`);
      assert.ok(groupDays.includes(date), `${s.key} has no make-up session`);
    }
  });

  it("holds an optional level revision on the last Friday of each month with a level roster", () => {
    const revisions = oneOffs.filter((s) => s.audience === "level");
    assert.deepEqual([...new Set(revisions.map((s) => s.occurrences[0].date))], ["2026-09-25", "2026-10-30", "2026-11-27"]);
    assert.ok(revisions.every((s) => s.mandatory === false && s.groupId === null));
    const placement = new Map(scenario.placements.map((p) => [p.studentId, p]));
    for (const session of scenario.sessions.filter((s) => s.audience === "level")) {
      const roster = scenario.roster.filter((r) => r.sessionId === session.id);
      assert.ok(roster.length >= 50, `${session.key} roster ${roster.length}`);
      assert.ok(roster.every((r) => placement.get(r.studentId).levelKey === session.levelKey && placement.get(r.studentId).mode === "in-person"));
    }
  });

  it("sets work only when its results finish before the reference date, due after it is set", () => {
    for (const a of scenario.assignments) assert.ok(a.dueAt > a.assignedAt && a.dueAt < "2026-11-25", a.key);
  });

  it("covers the term with a lesson and practice unit per topic", () => {
    const perLevel = Object.groupBy(scenario.library.units, (u) => u.levelKey);
    assert.ok(Object.values(perLevel).every((units) => units.length === 17));
    assert.ok(scenario.library.units.filter((u) => u.publishedAt).map((u) => u.publishedAt).sort().at(-1) > "2026-11-01");
  });
});
