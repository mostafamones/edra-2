// Invariant checks for a dev-academy scenario. Pure: no I/O.

import { cairoToUtcMs } from "./time.mjs";

// Mirrors web/src/lib/phone.ts (EGYPTIAN_MOBILE_PATTERN and normalizeEgyptianPhone). Keep in sync.
const EGYPTIAN_MOBILE_PATTERN = /^\+201[0125]\d{8}$/;

export function normalizeEgyptianPhone(value) {
  const compact = value.trim().replace(/[\s().-]/g, "");

  let national = compact;
  if (national.startsWith("0020")) national = national.slice(4);
  else if (national.startsWith("+20")) national = national.slice(3);
  else if (national.startsWith("20")) national = national.slice(2);

  if (national.startsWith("0")) national = national.slice(1);

  const normalized = `+20${national}`;
  return EGYPTIAN_MOBILE_PATTERN.test(normalized) ? normalized : null;
}

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;
const ATTENDANCE = new Set(["present", "late", "excused", "absent"]);
const RESULT_STATES = new Set(["missing", "received_unmarked", "marked_private", "announced", "late_announced"]);
const MARKED = new Set(["marked_private", "announced", "late_announced"]);
const ANNOUNCED = new Set(["announced", "late_announced"]);

export function validateScenario(scenario) {
  const errors = [];
  const fail = (message) => errors.push(message);
  const ms = (value) => Date.parse(value);
  const round2 = (n) => Math.round(n * 100) / 100;

  const byId = (list, label) => {
    const map = new Map();
    for (const item of list) {
      if (map.has(item.id)) fail(`${label} ${item.key} has a duplicate id`);
      map.set(item.id, item);
    }
    return map;
  };

  const { academicYear } = scenario.config;
  const yearStart = ms(academicYear.startsAt);
  const yearEnd = ms(academicYear.endsBefore);
  const inYear = (value, label) => {
    const t = ms(value);
    if (!(t >= yearStart && t < yearEnd)) fail(`${label} is outside the academic year: ${value}`);
  };

  const refStart = cairoToUtcMs(scenario.config.referenceDate, "00:00");
  const beforeRef = (value, label) => {
    if (value !== null && ms(value) >= refStart) fail(`${label} is on or after the reference date: ${value}`);
  };

  const staff = byId(scenario.staff, "staff");
    const students = byId(scenario.students, "student");
  const groups = byId(scenario.groups, "group");
  const sessions = byId(scenario.sessions, "session");
  const rosterById = byId(scenario.roster, "roster entry");
  const assignments = byId(scenario.assignments, "assignment");
  const exams = byId(scenario.exams, "exam");

  const phones = new Set();
  for (const person of [...scenario.staff, ...scenario.students]) {
    if (!person.placeholder && person.synthetic !== true) fail(`${person.key} must be marked synthetic`);
    if (person.phone === null) continue;
    if (normalizeEgyptianPhone(person.phone) !== person.phone) fail(`${person.key} phone fails the Egyptian mobile rule`);
    if (phones.has(person.phone)) fail(`${person.key} phone is duplicated`);
    phones.add(person.phone);
    if (person.parentPhone === undefined) continue;
    if (normalizeEgyptianPhone(person.parentPhone) !== person.parentPhone) fail(`${person.key} parent phone fails the Egyptian mobile rule`);
    if (phones.has(person.parentPhone)) fail(`${person.key} parent phone is duplicated`);
    phones.add(person.parentPhone);
  }

  const placementOf = new Map();
  for (const placement of scenario.placements) {
    const group = groups.get(placement.groupId);
    if (!students.has(placement.studentId)) fail(`${placement.key} references an unknown student`);
    if (!group) fail(`${placement.key} references an unknown group`);
    if (placementOf.has(placement.studentId)) fail(`${placement.key} duplicates the student placement`);
    placementOf.set(placement.studentId, placement);
    if (group && (group.levelKey !== placement.levelKey || group.track !== placement.track)) {
      fail(`${placement.key} is incompatible with ${group.key}`);
    }
    if (placement.mode !== "in-person") fail(`${placement.key} must be in-person`);
    inYear(placement.enrolledAt, `${placement.key} enrollment`);
  }
  for (const student of students.values()) {
    if (!placementOf.has(student.id)) fail(`${student.key} has no placement`);
  }
  for (const group of groups.values()) {
    const size = scenario.placements.filter((p) => p.groupId === group.id).length;
    if (size !== 5) fail(`${group.key} has ${size} students, expected 5`);
  }
  const afterEnrollment = (studentId, value, label) => {
    const placement = placementOf.get(studentId);
    if (placement && ms(value) < ms(placement.enrolledAt)) fail(`${label} precedes enrollment`);
  };

  for (const schedule of scenario.schedules) {
    if (!groups.has(schedule.groupId) || schedule.slots.length !== 2) {
      fail(`${schedule.key} must reference a group and have two slots`);
    }
  }

  for (const session of scenario.sessions) {
    if (!groups.has(session.groupId)) fail(`${session.key} references an unknown group`);
    if (!staff.has(session.startedById)) fail(`${session.key} references an unknown starter`);
    if (session.status !== "ended") fail(`${session.key} must be ended`);
    if (ms(session.endsAt) - ms(session.startsAt) !== 90 * MIN_MS) fail(`${session.key} must last 90 minutes`);
    inYear(session.startsAt, session.key);
    beforeRef(session.startsAt, session.key);
    beforeRef(session.endsAt, session.key);
  }

  const rosterPairs = new Set();
  for (const entry of scenario.roster) {
    const session = sessions.get(entry.sessionId);
    const placement = placementOf.get(entry.studentId);
    if (!session) fail(`${entry.key} references an unknown session`);
    if (!students.has(entry.studentId)) fail(`${entry.key} references an unknown student`);
    if (session && placement && placement.groupId !== session.groupId) {
      fail(`${entry.key} places a student outside the session group`);
    }
    const pair = `${entry.sessionId}:${entry.studentId}`;
    if (rosterPairs.has(pair)) fail(`${entry.key} duplicates a roster entry`);
    rosterPairs.add(pair);
    if (session) afterEnrollment(entry.studentId, session.startsAt, entry.key);
  }

  let attendanceItems = 0;
  const covered = new Set();
  for (const publication of scenario.attendancePublications) {
    const session = sessions.get(publication.sessionId);
    if (!session) fail(`${publication.key} references an unknown session`);
    else if (ms(publication.publishedAt) < ms(session.endsAt)) fail(`${publication.key} is published before its session ends`);
    inYear(publication.publishedAt, publication.key);
    beforeRef(publication.publishedAt, publication.key);
    for (const item of publication.items) {
      attendanceItems += 1;
      const entry = rosterById.get(item.rosterId);
      if (!entry || entry.sessionId !== publication.sessionId || entry.studentId !== item.studentId) {
        fail(`${item.key} does not match its roster entry`);
      }
      if (!ATTENDANCE.has(item.status)) fail(`${item.key} has an unknown status`);
      covered.add(item.rosterId);
    }
  }
  if (attendanceItems !== scenario.roster.length || covered.size !== scenario.roster.length) {
    fail("attendance items must cover every roster entry exactly once");
  }

  // Scores: one component per part, each within [0, max] with at most two decimals, total = sum of components.
  const checkScores = (label, parts, components, total) => {
    if (components.length !== parts.length) fail(`${label} must have one score per part`);
    components.forEach(({ partId, score }, i) => {
      const part = parts[i];
      if (!part || part.id !== partId) fail(`${label} score references an unexpected part`);
      if (!(score >= 0 && score <= (part?.maxScore ?? 0)) || round2(score) !== score) {
        fail(`${label} score is out of range or has more than two decimals`);
      }
    });
    const sum = round2(components.reduce((acc, c) => acc + c.score, 0));
    if (total !== sum) fail(`${label} total ${total} does not equal the component sum ${sum}`);
  };

  // Work timeline and state consistency for assignment and exam results.
  const checkResult = (label, r, start, end) => {
    if (!RESULT_STATES.has(r.state)) fail(`${label} has an unknown state`);
    if (r.gradedById !== null && !staff.has(r.gradedById)) fail(`${label} references an unknown grader`);
    for (const [field, value] of [["receivedAt", r.receivedAt], ["gradedAt", r.gradedAt], ["announcedAt", r.announcedAt]]) {
      if (value === null) continue;
      inYear(value, `${label} ${field}`);
      beforeRef(value, `${label} ${field}`);
    }
    if (r.state === "missing") {
      if (r.receivedAt || r.gradedAt || r.announcedAt || r.components !== null || r.total !== null) {
        fail(`${label} missing work must not carry times or marks`);
      }
      return;
    }
    if (!r.receivedAt) {
      fail(`${label} received work needs receivedAt`);
      return;
    }
    const received = ms(r.receivedAt);
    if (received < ms(start) || (end !== null && received > ms(end))) fail(`${label} receivedAt is outside its window`);
    if (MARKED.has(r.state) !== (r.gradedAt !== null)) fail(`${label} grading time does not match its state`);
    if (ANNOUNCED.has(r.state) !== (r.announcedAt !== null)) fail(`${label} announcement time does not match its state`);
    if (MARKED.has(r.state) !== (r.total !== null)) fail(`${label} total does not match its state`);
    if (r.gradedAt && ms(r.gradedAt) < received) fail(`${label} is graded before it is received`);
    if (r.announcedAt && ms(r.announcedAt) < ms(r.gradedAt)) fail(`${label} is announced before it is graded`);
  };

  // Authored content (edra-dev-v3 and later) must fit the database limits and readiness rules.
  const text = (value, max, label, { required = true, trimmed = false } = {}) => {
    if (value === undefined) return;
    if (typeof value !== "string" || value.length > max || (required && !value.trim()) || (trimmed && value !== value.trim())) {
      fail(`${label} is empty, too long or untrimmed`);
    }
  };
  const positions = (list, label) => {
    if (list.some((item, i) => item.position !== i + 1)) fail(`${label} positions are not 1..n`);
  };
  for (const a of scenario.assignments) {
    text(a.title, 200, `${a.key} title`, { trimmed: true });
    text(a.instructions, 10000, `${a.key} instructions`, { required: false });
    for (const part of a.parts) {
      if (!part.questions) continue;
      text(part.title, 200, `${part.key} title`, { trimmed: true });
      text(part.instructions, 5000, `${part.key} instructions`, { required: false });
      if (part.kind !== "file_upload") fail(`${part.key} must be a Written Work part: no per-question answers are seeded`);
      if (!part.questions.length) fail(`${part.key} has no questions`);
      positions(part.questions, part.key);
      for (const q of part.questions) {
        text(q.prompt, 2000, `${q.key} prompt`, { trimmed: true });
        if (!(q.maxScore > 0 && q.maxScore <= 1000)) fail(`${q.key} maximum is out of range`);
      }
      if (round2(part.questions.reduce((n, q) => n + q.maxScore, 0)) !== part.maxScore) fail(`${part.key} maximum is not the sum of its questions`);
    }
  }
  for (const e of scenario.exams) {
    if (!e.parts) continue;
    text(e.title, 200, `${e.key} title`, { trimmed: true });
    text(e.instructions, 10000, `${e.key} instructions`, { required: false });
    text(e.solutionNotes, 10000, `${e.key} solution notes`, { required: false });
    positions(e.parts, e.key);
    for (const part of e.parts) {
      text(part.title, 200, `${part.key} title`, { trimmed: true });
      text(part.instructions, 5000, `${part.key} instructions`, { required: false });
      const questions = e.questions.filter((q) => q.partId === part.id);
      if (!questions.length) fail(`${part.key} has no questions`);
      positions(questions, part.key);
      if (e.kind === "historical" && part.kind !== "written_work") fail(`${part.key}: paper exams have no seeded answers, so only Written Work`);
      for (const q of questions) {
        text(q.prompt, 5000, `${q.key} prompt`);
        text(q.modelAnswer, 10000, `${q.key} model answer`, { required: false });
        if (!(q.maxScore > 0 && q.maxScore <= 1000)) fail(`${q.key} maximum is out of range`);
        if (part.kind === "written_work") {
          if (q.choices !== undefined || q.correctChoice !== undefined) fail(`${q.key} Written Work has no choices`);
          continue;
        }
        if (part.kind !== "question_sheet") fail(`${part.key} has an unknown kind`);
        const choices = q.choices ?? [];
        if (choices.length < 2 || choices.length > 10 || new Set(choices).size !== choices.length) fail(`${q.key} needs 2 to 10 distinct choices`);
        for (const label of choices) text(label, 1000, `${q.key} choice`);
        const correct = "ABCDEFGHIJ".indexOf(q.correctChoice);
        if (q.correctChoice?.length !== 1 || correct < 0 || correct >= choices.length) fail(`${q.key} needs exactly one correct choice`);
      }
    }
    if (e.questions.some((q) => !e.parts.some((part) => part.id === q.partId))) fail(`${e.key} has a question outside its parts`);
  }

  for (const a of scenario.assignments) {
    if (!groups.has(a.groupId)) fail(`${a.key} references an unknown group`);
    inYear(a.assignedAt, a.key);
    beforeRef(a.assignedAt, a.key);
    beforeRef(a.dueAt, a.key);
    if (ms(a.dueAt) < ms(a.assignedAt)) fail(`${a.key} is due before it is assigned`);
  }
  for (const r of scenario.assignmentResults) {
    const a = assignments.get(r.assignmentId);
    if (!a) fail(`${r.key} references an unknown assignment`);
    if (!students.has(r.studentId)) fail(`${r.key} references an unknown student`);
    if (a && placementOf.get(r.studentId)?.groupId !== a.groupId) fail(`${r.key} student is not in the assignment group`);
    if (!a) continue;
    afterEnrollment(r.studentId, a.assignedAt, r.key);
    checkResult(r.key, r, a.assignedAt, null);
    if (r.receivedAt && (ms(r.receivedAt) > ms(a.dueAt)) !== (r.state === "late_announced")) {
      fail(`${r.key} lateness does not match its receipt time`);
    }
    if (MARKED.has(r.state)) checkScores(r.key, a.parts, r.components, r.total);
    else if (r.components !== null) fail(`${r.key} has components without a marked state`);
  }

  for (const e of scenario.exams) {
    if (!e.groupIds.every((id) => groups.has(id))) fail(`${e.key} references an unknown group`);
    inYear(e.opensAt, e.key);
    inYear(e.closesAt, e.key);
    if (e.kind === "historical") {
      beforeRef(e.opensAt, e.key);
      beforeRef(e.closesAt, e.key);
    } else if (e.kind === "open") {
      beforeRef(e.opensAt, e.key);
      if (ms(e.closesAt) <= refStart + DAY_MS) fail(`${e.key} must stay open through the reference date`);
    } else if (e.kind === "upcoming") {
      if (ms(e.opensAt) < refStart + DAY_MS) fail(`${e.key} must open after the reference date`);
    }
    if (ms(e.scheduledClosesAt) < ms(e.opensAt) + 60 * MIN_MS) fail(`${e.key} window must allow the 60-minute timer`);
    if (ms(e.closesAt) !== ms(e.scheduledClosesAt) + 2 * MIN_MS) fail(`${e.key} closure must be 2 minutes after scheduled closure`);
  }
  for (const r of scenario.examResults) {
    const e = exams.get(r.examId);
    if (!e) fail(`${r.key} references an unknown exam`);
    if (!students.has(r.studentId)) fail(`${r.key} references an unknown student`);
    if (e && !e.groupIds.includes(placementOf.get(r.studentId)?.groupId)) fail(`${r.key} student is not in the exam group`);
    if (!e) continue;
    checkResult(r.key, r, e.opensAt, e.closesAt);
    if (MARKED.has(r.state)) checkScores(r.key, e.questions, r.components, r.total);
    else if (r.components !== null) fail(`${r.key} has components without a marked state`);
  }

  return { valid: errors.length === 0, errors };
}
