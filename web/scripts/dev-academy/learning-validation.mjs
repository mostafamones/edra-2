// v6 invariants: 280-320 students, exactly 60 online-only without group or attendance, level-audience online work.
export function validateLearningScenario(scenario) {
  const errors = [];
  const total = scenario.students.length;
  if (total < 280 || total > 320) errors.push(`student total ${total} is outside 280-320`);
  const online = new Set(scenario.placements.filter((p) => p.mode === "online-only").map((p) => p.studentId));
  if (online.size !== 60) errors.push(`expected 60 online-only students, got ${online.size}`);
  if (scenario.roster.some((r) => online.has(r.studentId))) errors.push("online-only students must have no attendance");
  for (const a of scenario.assignments) {
    if (a.audience === "level" && (a.deliveryMode !== "online" || a.groupId !== null)) errors.push(`${a.key} must be an online level assignment`);
  }
  for (const r of scenario.assignmentResults) {
    const a = scenario.assignments.find((x) => x.id === r.assignmentId);
    if (online.has(r.studentId) !== (a.audience === "level")) errors.push(`${r.key} mixes online-only and group work`);
  }
  const lib = scenario.library;
  if (!lib) return [...errors, "missing learning library"];
  const unit = new Map(lib.units.map((u) => [u.id, u]));
  const asset = new Map(lib.assets.map((a) => [a.id, a]));
  const placement = new Map(scenario.placements.map((p) => [p.studentId, p]));
  const assignments = new Map(scenario.assignments.map((a) => [a.id, a]));
  const yearStart = Date.parse(scenario.config.academicYear.startsAt);
  for (const u of lib.units) {
    if (!asset.has(u.assetId) || !u.items.some((i) => i.assetId === u.assetId && i.kind === "explanation")) errors.push(`${u.key} lacks its placeholder video`);
    if (u.assignmentId && assignments.get(u.assignmentId)?.levelKey !== u.levelKey) errors.push(`${u.key} attaches another level's assignment`);
  }
  if (new Set(lib.units.map((u) => u.assignmentId).filter(Boolean)).size !== lib.units.filter((u) => u.assignmentId).length) errors.push("an assignment is attached twice");
  const seen = new Set();
  for (const g of lib.grants) {
    const u = unit.get(g.unitId), p = placement.get(g.studentId);
    if (!u || !p || p.levelKey !== u.levelKey || !["published", "published_edited"].includes(u.state)) errors.push(`${g.key} targets an unavailable unit`);
    else if (u.assignmentId && p.mode !== "online-only") errors.push(`${g.key} grants an assignment unit to an in-person student`);
    if (Date.parse(g.startsAt) < Date.parse(p.enrolledAt) || Date.parse(g.expiresAt) <= Date.parse(g.startsAt)) errors.push(`${g.key} has an invalid window`);
    if (Date.parse(g.startsAt) < yearStart || Date.parse(g.startsAt) >= Date.parse(scenario.config.referenceDate)) errors.push(`${g.key} starts outside the history`);
    seen.add(g.id);
  }
  for (const r of lib.progress) {
    const a = asset.get(r.assetId);
    if (!lib.grants.some((g) => g.studentId === r.studentId && g.unitId === r.unitId)) errors.push(`progress for ${r.studentId} has no access`);
    if (r.ranges.some(([lo, hi]) => !(lo >= 0 && hi > lo && hi <= a.durationSeconds))) errors.push(`progress for ${r.assetId} is outside the video`);
  }
  return errors;
}
