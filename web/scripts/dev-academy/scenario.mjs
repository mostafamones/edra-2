// Pure, deterministic dev-academy scenario builder: no I/O, network, environment or credentials.
// Recipes: edra-dev-v1 follows web/planning/development-tools/01-scenario.md; edra-dev-v2 adds profiles.mjs (see README "Recipes").
import { createHash } from "node:crypto";

import { profileModel } from "./profiles.mjs";
import { FAMILY_NAMES, FATHER_NAMES, FIRST_NAMES } from "./names.mjs";
import { normalizeEgyptianPhone, validateScenario } from "./validate.mjs";
import { TIMEZONE, addDays, cairoToUtcMs, iso, isCalendarDate, weekdayOf } from "./time.mjs";

export { validateScenario };

export const DEFAULTS = Object.freeze({
  recipeVersion: "edra-dev-v2",
  seed: "edra-20-v1",
  referenceDate: "2026-10-21",
  students: 20,
});

const STUDENT_COUNT = 20;
const GROUP_SIZE = 5;
const TEACHER_COUNT = 3;
const DAY_MS = 86_400_000;
const MIN_MS = 60_000;
const SESSION_MS = 90 * MIN_MS;
const EXAM_TIMER_MS = 60 * MIN_MS;
const EXAM_GRACE_MS = 2 * MIN_MS;
const CARRIER_DIGITS = ["0", "1", "2", "5"]; // second digit after +201, the Egyptian mobile rule in phone.ts
const PATTERNS = ["consistent", "improving", "temporary-dip", "irregular"];
const CURRENT_STATES = ["missing", "received_unmarked", "marked_private", "announced", "late_announced"];
const MARKED = new Set(["marked_private", "announced", "late_announced"]);
const ANNOUNCED = new Set(["announced", "late_announced"]);
const CHOICES = ["A", "B", "C", "D"];
const GROUPS = [
  { key: "group:prep-3-a", name: "Preparatory 3 A", levelKey: "preparatory-3", track: null, weekdays: [1, 4], startTime: "16:00" },
  { key: "group:prep-3-b", name: "Preparatory 3 B", levelKey: "preparatory-3", track: null, weekdays: [2, 5], startTime: "16:00" },
  { key: "group:sec-2-scientific", name: "Secondary 2 Scientific", levelKey: "secondary-2", track: "scientific", weekdays: [1, 4], startTime: "18:00" },
  { key: "group:sec-2-literature", name: "Secondary 2 Literature", levelKey: "secondary-2", track: "literature", weekdays: [2, 5], startTime: "18:00" },
];
const GENERATED_STAFF = [
  { key: "staff:owner", role: "owner" },
  { key: "staff:head-admin", role: "head_admin" },
  { key: "staff:admin", role: "admin" },
  { key: "staff:instructor-1", role: "instructor" },
  { key: "staff:instructor-2", role: "instructor" },
  { key: "staff:instructor-3", role: "instructor" },
];

const pad2 = (n) => String(n).padStart(2, "0");
const at = (ms) => (ms === null ? null : iso(ms));
const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const isMiddleWeek = (w, weeks) => w === Math.floor(weeks / 2) - 1 || w === Math.floor(weeks / 2);

// Stateless keyed randomness: every value depends only on recipe, seed and its logical key,
// so adding a feature never shifts the values of unrelated entities.
function keyedRandom(recipeVersion, seed) {
  const digest = (key) => createHash("sha256").update(`${recipeVersion}:${seed}:${key}`).digest();
  const unit = (key) => digest(key).readUInt32BE(0) / 2 ** 32;
  return {
    unit,
    pick: (list, key) => list[Math.floor(unit(key) * list.length)],
    uuid: (key) => {
      const hex = createHash("sha256").update(`${recipeVersion}:${seed}:id:${key}`).digest("hex").slice(0, 32);
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    },
  };
}

function weighted(entries, u) {
  let acc = 0;
  for (const [value, p] of entries) {
    acc += p;
    if (u < acc) return value;
  }
  return entries.at(-1)[0];
}

function attendanceWeights(pattern, w, weeks) {
  if (pattern === "consistent") return [["present", 0.9], ["late", 0.05], ["excused", 0.02], ["absent", 0.03]];
  if (pattern === "irregular") return [["present", 0.55], ["late", 0.15], ["excused", 0.05], ["absent", 0.25]];
  const present = pattern === "improving" ? 0.65 + (0.25 * w) / Math.max(1, weeks - 1) : isMiddleWeek(w, weeks) ? 0.6 : 0.9;
  return [["present", present], ["late", 0.05], ["excused", 0.05], ["absent", Math.max(0, 0.9 - present)]];
}

function baselinePct(pattern, w, weeks) {
  if (pattern === "consistent") return 84;
  if (pattern === "improving") return 55 + (30 * w) / Math.max(1, weeks - 1);
  if (pattern === "temporary-dip") return isMiddleWeek(w, weeks) ? 60 : 82;
  return 65; // irregular
}

// Component marks: pattern baseline, plus ±10 noise per assessment and ±5 per component, clamped to [0, max].
function scoreParts(rand, key, parts, pattern, w, weeks) {
  const base = baselinePct(pattern, w, weeks);
  const assessmentNoise = (rand.unit(`${key}:noise`) * 2 - 1) * 10;
  const components = parts.map((part) => {
    const componentNoise = (rand.unit(`${key}:${part.key}:noise`) * 2 - 1) * 5;
    const pct = clamp(base + assessmentNoise + componentNoise, 0, 100);
    return { partId: part.id, score: clamp(round2((part.maxScore * pct) / 100), 0, part.maxScore) };
  });
  return { components, total: round2(components.reduce((sum, c) => sum + c.score, 0)) };
}

const receiveChance = (pattern) => (pattern === "irregular" ? 0.7 : 0.95);

// edra-dev-v1 must keep reproducing registered runs byte for byte: do not change this model.
function patternModel(rand, weeks) {
  return {
    traits(studentKeys) {
      const order = [...studentKeys].sort((a, b) => rand.unit(`pattern:${a}`) - rand.unit(`pattern:${b}`));
      return new Map(order.map((key, i) => [key, { pattern: PATTERNS[Math.floor(i / GROUP_SIZE)] }]));
    },
    attendanceWeights: (student, w) => attendanceWeights(student.pattern, w, weeks),
    submitChance: (student) => receiveChance(student.pattern),
    satExam: (_status, student, key) => rand.unit(`${key}:${student.key}:receive`) < receiveChance(student.pattern),
    scoreParts: (key, parts, student, w) => scoreParts(rand, key, parts, student.pattern, w, weeks),
  };
}

// A registered run is rebuilt with its own recipe; unknown versions are refused, never approximated.
const RECIPES = { "edra-dev-v1": patternModel, "edra-dev-v2": profileModel };
export const RECIPE_VERSIONS = Object.freeze(Object.keys(RECIPES));

export function buildScenario(options = {}) {
  const { recipeVersion, seed, referenceDate, students: studentCount } = { ...DEFAULTS, ...options };
  if (typeof recipeVersion !== "string" || !recipeVersion || typeof seed !== "string" || !seed) {
    throw new TypeError("recipeVersion and seed must be non-empty strings");
  }
  if (!Object.hasOwn(RECIPES, recipeVersion)) {
    throw new RangeError(`Unknown recipe "${recipeVersion}"; supported recipes: ${RECIPE_VERSIONS.join(", ")}`);
  }
  if (studentCount !== STUDENT_COUNT) throw new RangeError(`Only ${STUDENT_COUNT} students are supported, got ${studentCount}`);
  if (!isCalendarDate(referenceDate)) throw new RangeError(`Reference date must be a real YYYY-MM-DD date, got ${referenceDate}`);

  const rand = keyedRandom(recipeVersion, seed);
  const utc = (date, hhmm) => iso(cairoToUtcMs(date, hhmm));

  // Academic year starts on Aug 16 and holds current-year history only (owner decision).
  const refYear = Number(referenceDate.slice(0, 4));
  const firstYear = referenceDate >= `${refYear}-08-16` ? refYear : refYear - 1;
  const startsOn = `${firstYear}-08-16`;
  const endsOn = `${firstYear + 1}-08-15`;
  const academicYear = {
    startsOn,
    endsOn,
    startsAt: utc(startsOn, "00:00"),
    endsBefore: utc(addDays(endsOn, 1), "00:00"),
  };

  // Complete Monday-Sunday weeks inside the academic year that end before the reference date.
  const weeks = [];
  for (let start = addDays(startsOn, (8 - weekdayOf(startsOn)) % 7); addDays(start, 6) < referenceDate; start = addDays(start, 7)) {
    weeks.push(start);
  }
  if (weeks.length === 0) {
    throw new Error(
      `Insufficient history: reference date ${referenceDate} has no complete teaching week in academic year ${startsOn} to ${endsOn}. Choose a later reference date.`,
    );
  }
  if (cairoToUtcMs(addDays(referenceDate, 5), "16:00") + EXAM_GRACE_MS >= Date.parse(academicYear.endsBefore)) {
    throw new Error(
      `Upcoming exam window does not fit academic year ${startsOn} to ${endsOn}. Choose an earlier reference date.`,
    );
  }

  // Names and phones are unique across staff and students; retries are keyed, so output stays deterministic.
  const taken = { names: new Set(), phones: new Set() };
  const contact = (key) => {
    for (let attempt = 0; ; attempt += 1) {
      const k = attempt ? `${key}:retry${attempt}` : key;
      const displayName = [rand.pick(FIRST_NAMES, `${k}:first`), rand.pick(FATHER_NAMES, `${k}:father`), rand.pick(FAMILY_NAMES, `${k}:family`)].join(" ");
      const carrier = CARRIER_DIGITS[Math.floor(rand.unit(`${k}:carrier`) * CARRIER_DIGITS.length)];
      const digits = Array.from({ length: 8 }, (_, i) => Math.floor(rand.unit(`${k}:digit${i}`) * 10)).join("");
      const phone = `+201${carrier}${digits}`;
      if (!taken.names.has(displayName) && !taken.phones.has(phone) && normalizeEgyptianPhone(phone) === phone) {
        taken.names.add(displayName);
        taken.phones.add(phone);
        return { displayName, phone };
      }
    }
  };

  const staff = [
    ...GENERATED_STAFF.map(({ key, role }) => ({ id: rand.uuid(key), key, role, ...contact(key), synthetic: true, accountKey: `account:${key}`, placeholder: false })),
    { id: rand.uuid("staff:real-owner"), key: "staff:real-owner", role: "instructor", displayName: null, phone: null, accountKey: null, placeholder: true },
  ];
  const teachers = staff.filter((s) => s.role === "instructor" && !s.placeholder);
  const teacherAt = (index) => teachers[index % TEACHER_COUNT].id;
  const academy = { id: rand.uuid("academy:edra-dev"), key: "academy:edra-dev", name: "Edra Dev Academy" };

  const groups = GROUPS.map(({ key, name, levelKey, track }) => ({ id: rand.uuid(key), key, name, levelKey, track }));
  const schedules = GROUPS.map((def, gi) => ({
    id: rand.uuid(`schedule:${def.key}`),
    key: `schedule:${def.key}`,
    groupId: groups[gi].id,
    slots: def.weekdays.map((weekday) => ({ weekday, startTime: def.startTime, durationMinutes: 90 })),
  }));

  const model = RECIPES[recipeVersion](rand, weeks.length);
  const studentKeys = Array.from({ length: STUDENT_COUNT }, (_, i) => `student:${pad2(i + 1)}`);
  const traitsOf = model.traits(studentKeys);
  const students = studentKeys.map((key) => ({ id: rand.uuid(key), key, ...contact(key), synthetic: true, accountKey: `account:${key}`, ...traitsOf.get(key) }));
  // Parent contacts are drawn after every person's own phone, so adding them left earlier output unchanged.
  for (const student of students) student.parentPhone = contact(`${student.key}:parent`).phone;
  const placements = studentKeys.map((key, i) => {
    const group = groups[Math.floor(i / GROUP_SIZE)];
    return {
      id: rand.uuid(`placement:${key}`),
      key: `placement:${key}`,
      studentId: rand.uuid(key),
      groupId: group.id,
      levelKey: group.levelKey,
      track: group.track,
      mode: "in-person",
      enrolledAt: academicYear.startsAt,
    };
  });
  const groupOf = new Map(placements.map((p) => [p.studentId, p.groupId]));
  const membersOf = (groupId) => students.filter((s) => groupOf.get(s.id) === groupId);

  // Sessions: two per group per week, sorted by start, starters distributed round-robin.
  const sessions = [];
  weeks.forEach((weekStart, w) => {
    GROUPS.forEach((def, gi) => {
      for (const slot of schedules[gi].slots) {
        const startMs = cairoToUtcMs(addDays(weekStart, slot.weekday - 1), slot.startTime);
        sessions.push({
          id: rand.uuid(`session:${def.key}:w${pad2(w + 1)}:d${slot.weekday}`),
          key: `session:${def.key}:w${pad2(w + 1)}:d${slot.weekday}`,
          groupId: groups[gi].id,
          week: w + 1,
          startsAt: iso(startMs),
          endsAt: iso(startMs + SESSION_MS),
          status: "ended",
          startedById: null,
        });
      }
    });
  });
  sessions.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.key.localeCompare(b.key));
  sessions.forEach((session, i) => {
    session.startedById = teacherAt(i);
  });

  const firstSessionMs = (groupId, w) => Date.parse(sessions.find((s) => s.groupId === groupId && s.week === w + 1).startsAt);

  const statusOf = new Map(); // `${sessionId}:${studentId}` -> attendance status
  const roster = [];
  const attendancePublications = [];
  for (const session of sessions) {
    const w = session.week - 1;
    const items = membersOf(session.groupId).map((student) => {
      const entry = {
        id: rand.uuid(`roster:${session.key}:${student.key}`),
        key: `roster:${session.key}:${student.key}`,
        sessionId: session.id,
        studentId: student.id,
      };
      roster.push(entry);
      const status = weighted(model.attendanceWeights(student, w), rand.unit(`attendance:${student.key}:${session.key}`));
      statusOf.set(`${session.id}:${student.id}`, status);
      return { id: rand.uuid(`attendance-item:${session.key}:${student.key}`), key: `attendance-item:${session.key}:${student.key}`, rosterId: entry.id, studentId: student.id, status };
    });
    attendancePublications.push({
      id: rand.uuid(`attendance-publication:${session.key}`),
      key: `attendance-publication:${session.key}`,
      sessionId: session.id,
      publishedAt: iso(Date.parse(session.endsAt) + 60 * MIN_MS),
      items,
    });
  }

  const questionsFor = (key, format) =>
    Array.from({ length: 5 }, (_, i) => {
      const qKey = `${key}:q${i + 1}`;
      const base = { id: rand.uuid(qKey), key: qKey, position: i + 1, maxScore: 20 };
      if (format === "paper") return base;
      return { ...base, prompt: `Question ${i + 1}`, choices: CHOICES.map((c) => `Option ${c}`), correctChoice: rand.pick(CHOICES, `${qKey}:correct`) };
    });
  const examRecord = ({ key, kind, format, groupIds, opensMs, closesMs = opensMs + EXAM_TIMER_MS, week = null }) => ({
    id: rand.uuid(key),
    key,
    kind,
    format,
    groupIds,
    week,
    opensAt: iso(opensMs),
    scheduledClosesAt: iso(closesMs),
    closesAt: iso(closesMs + EXAM_GRACE_MS),
    timerMinutes: 60,
    questions: questionsFor(key, format),
  });

  let graderIndex = 0;
  const gradedBy = () => teacherAt(graderIndex++);

  // Assignments: historical physical work every second week; four current items in the last complete week.
  const assignments = [];
  groups.forEach((group) => {
    weeks.forEach((weekStart, w) => {
      const kinds = [];
      if (w % 2 === 1) kinds.push("historical");
      if (w === weeks.length - 1) kinds.push("current");
      for (const kind of kinds) {
        const key = `assignment:${group.key}:w${pad2(w + 1)}:${kind}`;
        assignments.push({
          id: rand.uuid(key),
          key,
          kind,
          groupId: group.id,
          week: w + 1,
          deliveryMode: "physical",
          assignedAt: at(firstSessionMs(group.id, w)),
          dueAt: utc(addDays(weekStart, 3), "23:59"),
          parts: [1, 2].map((n) => ({ id: rand.uuid(`${key}:part${n}`), key: `${key}:part${n}`, title: `Written Work ${n}`, maxScore: 50 })),
        });
      }
    });
  });

  const assignmentResults = [];
  for (const a of assignments) {
    const gi = groups.findIndex((g) => g.id === a.groupId);
    membersOf(a.groupId).forEach((student, j) => {
      const state =
        a.kind === "current"
          ? CURRENT_STATES[(j + gi) % CURRENT_STATES.length]
          : rand.unit(`${a.key}:${student.key}:receive`) < model.submitChance(student, a.week - 1) ? "announced" : "missing";
      const key = `assignment-result:${a.key}:${student.key}`;
      const assignedMs = Date.parse(a.assignedAt);
      const dueMs = Date.parse(a.dueAt);
      const receivedMs = state === "missing" ? null : state === "late_announced" ? dueMs + DAY_MS : assignedMs + 2 * DAY_MS;
      const gradedMs = MARKED.has(state) ? receivedMs + DAY_MS : null;
      const announcedMs = ANNOUNCED.has(state) ? gradedMs + DAY_MS : null;
      const marks = MARKED.has(state)
        ? { ...model.scoreParts(key, a.parts, student, a.week - 1), gradedById: gradedBy() }
        : { components: null, total: null, gradedById: null };
      assignmentResults.push({
        id: rand.uuid(key),
        key,
        assignmentId: a.id,
        studentId: student.id,
        state,
        receivedAt: at(receivedMs),
        late: state === "late_announced",
        gradedAt: at(gradedMs),
        announcedAt: at(announcedMs),
        ...marks,
      });
    });
  }

  // Exams: paper exams every fourth week for each group; open and upcoming MCQ exams have no seeded work.
  const exams = [];
  const examResults = [];
  groups.forEach((group, gi) => {
    weeks.forEach((_, w) => {
      if (w % 4 !== 3) return;
      const exam = examRecord({ key: `exam:${GROUPS[gi].key}:w${pad2(w + 1)}`, kind: "historical", format: "paper", groupIds: [group.id], week: w + 1, opensMs: firstSessionMs(group.id, w) });
      exams.push(exam);
      const closesMs = Date.parse(exam.closesAt);
      const examSession = sessions.find((s) => s.groupId === group.id && s.startsAt === exam.opensAt);
      for (const student of membersOf(group.id)) {
        const key = `exam-result:${exam.key}:${student.key}`;
        const received = model.satExam(statusOf.get(`${examSession.id}:${student.id}`), student, exam.key);
        const marks = received
          ? { receivedAt: iso(Date.parse(exam.opensAt) + 50 * MIN_MS), gradedAt: iso(closesMs + DAY_MS), announcedAt: iso(closesMs + 2 * DAY_MS), gradedById: gradedBy(), ...model.scoreParts(key, exam.questions, student, w) }
          : { receivedAt: null, gradedAt: null, announcedAt: null, gradedById: null, components: null, total: null };
        examResults.push({ id: rand.uuid(key), key, examId: exam.id, studentId: student.id, state: received ? "announced" : "missing", ...marks });
      }
    });
  });
  const preparatoryIds = groups.filter((g) => g.levelKey === "preparatory-3").map((g) => g.id);
  const secondaryIds = groups.filter((g) => g.levelKey === "secondary-2").map((g) => g.id);
  exams.push(
    examRecord({ key: "exam:level:preparatory-3:open", kind: "open", format: "mcq", groupIds: preparatoryIds, opensMs: cairoToUtcMs(addDays(referenceDate, -1), "16:00"), closesMs: cairoToUtcMs(addDays(referenceDate, 2), "16:00") }),
    examRecord({ key: "exam:level:secondary-2:upcoming", kind: "upcoming", format: "mcq", groupIds: secondaryIds, opensMs: cairoToUtcMs(addDays(referenceDate, 3), "16:00"), closesMs: cairoToUtcMs(addDays(referenceDate, 5), "16:00") }),
  );

  const scenario = {
    schema: "edra-dev-scenario",
    schemaVersion: 1,
    config: {
      recipeVersion,
      seed,
      referenceDate,
      timezone: TIMEZONE,
      studentCount: STUDENT_COUNT,
      academicYear,
      teachingWeeks: { count: weeks.length, firstStartsOn: weeks[0], lastEndsOn: addDays(weeks.at(-1), 6) },
      sessionMinutes: 90,
      examTimerMinutes: 60,
      examGraceMinutes: 2,
    },
    academy,
    staff,
    students,
    placements,
    groups,
    schedules,
    sessions,
    roster,
    attendancePublications,
    assignments,
    assignmentResults,
    exams,
    examResults,
  };

  const validation = validateScenario(scenario);
  if (!validation.valid) throw new Error(`Generated scenario failed validation: ${validation.errors.slice(0, 5).join("; ")}`);
  return scenario;
}
