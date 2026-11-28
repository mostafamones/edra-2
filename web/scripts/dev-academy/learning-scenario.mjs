// edra-dev-v6: a seeded student total of 280-320 with 60 online-only students (no group, no attendance),
// whose work is level-audience online assignments and online exams.
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const ONLINE_ONLY = 60;

// Twelve group sizes summing to `total`: an even split nudged by seeded one-student moves.
export function learningGroupSizes(rand, total) {
  const n = 12;
  const base = Math.floor(total / n);
  const sizes = Array.from({ length: n }, (_, i) => base + (i < total - base * n ? 1 : 0));
  for (let k = 0; k < 8; k++) {
    const from = Math.floor(rand.unit(`group-size:${k}:from`) * n);
    const to = Math.floor(rand.unit(`group-size:${k}:to`) * n);
    if (from !== to && sizes[from] > base - 3 && sizes[to] < base + 3) { sizes[from]--; sizes[to]++; }
  }
  return sizes;
}

// Online-only students take level-audience work: an assignment every second week and an online exam every fourth.
export function addOnlineAssessments(scenario, rand, weeks, content) {
  const online = scenario.students.filter((s) => scenario.placements.find((p) => p.studentId === s.id).mode === "online-only");
  const placement = new Map(scenario.placements.map((p) => [p.studentId, p]));
  const levels = [...new Set(scenario.groups.map((g) => g.levelKey))];
  const levelOf = (groupId) => scenario.groups.find((g) => g.id === groupId).levelKey;
  const staff = scenario.staff.find((s) => s.role === "instructor" && !s.placeholder).id;
  const iso = (ms) => new Date(ms).toISOString();
  const DAY = 86_400_000;
  const chance = (student, key) => clamp(student.profile.ability / 100 + 0.1 - 0.15 * rand.unit(`${key}:${student.key}:habit`), 0.15, 0.97);

  levels.forEach((levelKey, li) => {
    let ordinal = 0;
    for (let w = 0; w < weeks.length - 1; w += 2) {
      const reference = scenario.assignments.find((a) => a.week === w + 1 && a.kind === "historical" && levelOf(a.groupId) === levelKey);
      if (!reference) continue;
      const key = `assignment:online:${levelKey}:w${String(w + 1).padStart(2, "0")}`;
      const a = {
        id: rand.uuid(key), key, kind: "historical", audience: "level", levelKey, groupId: null, week: w + 1,
        deliveryMode: "online", assignedAt: reference.assignedAt, dueAt: reference.dueAt,
        ...content.assignment({ key, levelKey, ordinal: ordinal++ }),
      };
      scenario.assignments.push(a);
      online.filter((s) => placement.get(s.id).levelKey === levelKey && placement.get(s.id).enrolledAt <= a.assignedAt).forEach((student) => {
        const rkey = `assignment-result:${a.key}:${student.key}`;
        const sent = rand.unit(`${rkey}:sent`) < chance(student, a.key);
        const late = sent && rand.unit(`${rkey}:late`) < 0.15;
        const receivedMs = sent ? (late ? Date.parse(a.dueAt) + DAY : Date.parse(a.assignedAt) + DAY * (1 + Math.floor(rand.unit(`${rkey}:day`) * 2))) : null;
        scenario.assignmentResults.push({
          id: rand.uuid(rkey), key: rkey, assignmentId: a.id, studentId: student.id,
          state: sent ? (late ? "late_announced" : "announced") : "missing",
          receivedAt: receivedMs && iso(receivedMs), late,
          gradedAt: receivedMs && iso(receivedMs + DAY), announcedAt: receivedMs && iso(receivedMs + 2 * DAY),
          gradedById: sent ? staff : null, components: null, total: null,
        });
      });
    }
    // Online exams reuse the level's practice paper and finish before the reference date.
    for (let w = 1; w < weeks.length - 1; w += 4) {
      const reference = scenario.exams.find((e) => e.kind === "historical" && e.week === w + 1 && levelOf(e.groupIds[0]) === levelKey);
      if (!reference) continue;
      const key = `exam:online:${levelKey}:w${String(w + 1).padStart(2, "0")}`;
      const e = {
        id: rand.uuid(key), key, kind: "historical", audience: "level", levelKey, groupIds: [], week: w + 1,
        opensAt: reference.opensAt, scheduledClosesAt: reference.scheduledClosesAt, closesAt: reference.closesAt, timerMinutes: 60,
        ...content.practiceExam({ key, levelKey }),
        format: "online",
      };
      scenario.exams.push(e);
      online.filter((s) => placement.get(s.id).levelKey === levelKey && placement.get(s.id).enrolledAt <= e.opensAt).forEach((student) => {
        const rkey = `exam-result:${e.key}:${student.key}`;
        const sat = rand.unit(`${rkey}:sat`) < chance(student, e.key);
        scenario.examResults.push({
          id: rand.uuid(rkey), key: rkey, examId: e.id, studentId: student.id, state: sat ? "announced" : "missing",
          receivedAt: sat ? iso(Date.parse(e.opensAt) + 50 * 60_000) : null, gradedAt: null, announcedAt: null,
          gradedById: sat ? staff : null, components: null, total: null,
        });
      });
    }
    void li;
  });
}
