// v5 only: authored choice work, question-level marking and completed online exam histories.
// Assignment manual work stores question scores, not student text (the application's contract).
import { programmingContent } from "./assessments.mjs";

const LETTERS = "ABCDEFGHIJ";
const DAY = 86_400_000;
const MINUTE = 60_000;
const sum = (items) => Math.round(items.reduce((n, item) => n + item.score, 0) * 100) / 100;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function answerContent(rand) {
  const base = programmingContent(rand);
  return {
    ...base,
    assignment(input) {
      const assignment = base.assignment(input);
      const practice = base.practiceExam(input);
      const choices = practice.questions.filter((q) => q.choices);
      const partKey = `${input.key}:choice-check`;
      const questions = Array.from({ length: 4 }, (_, i) => {
        const q = choices[(input.ordinal * 4 + i) % choices.length];
        const key = `${partKey}:q${i + 1}`;
        return { ...q, id: rand.uuid(key), key, partId: rand.uuid(partKey), position: i + 1, maxScore: 2 };
      });
      return { ...assignment, parts: [...assignment.parts, {
        id: rand.uuid(partKey), key: partKey, title: "Programming check", kind: "online_questions",
        instructions: "Choose one answer for each question.", maxScore: 8, questions,
      }] };
    },
    paperExam(input) {
      return input.ordinal % 2 ? base.practiceExam(input) : base.paperExam(input);
    },
  };
}

// These are explicit authored variants for the two C++ practice Written Work questions.
const WRITTEN = [
  {
    partial: "int a, b;\nstd::cin >> a >> b;\nstd::cout << a + b;",
    incorrect: "int a, b;\nstd::cin >> a >> b;\nstd::cout << a - b;",
  },
  {
    partial: "The condition is false at the start. The loop should use i >= 1.",
    incorrect: "Change i-- to i++ so that the loop can reach the condition.",
  },
];

export function populateAnswers(scenario, rand) {
  const students = new Map(scenario.students.map((s) => [s.id, s]));
  const assignments = new Map(scenario.assignments.map((a) => [a.id, a]));
  const exams = new Map(scenario.exams.map((e) => [e.id, e]));
  const after = (at, days) => new Date(Date.parse(at) + days * DAY).toISOString();

  function answer(question, student, assessment, part, key) {
    // Topic strength repeats across assessments in the same unit/part; difficulty repeats for a prompt.
    const topic = assessment.unit ?? part.title;
    const difficulty = 0.2 + 0.6 * rand.unit(`difficulty:${question.prompt}`);
    const strength = (rand.unit(`topic:${student.key}:${topic}`) - 0.5) * 0.24;
    const progress = (assessment.week - 1) / Math.max(1, scenario.config.teachingWeeks.count - 1);
    const trajectory = student.pattern === "improving" ? (progress - 0.5) * 0.2
      : student.pattern === "temporary-dip" && progress >= 0.35 && progress <= 0.55 ? -0.18 : 0;
    const chance = clamp(student.profile.ability / 100 + strength + trajectory - (difficulty - 0.5) * 0.7, 0.08, 0.98);
    const blank = rand.unit(`${key}:blank`) < 0.07;
    const correct = !blank && rand.unit(`${key}:correct`) < chance;
    if (question.choices) {
      const wrong = LETTERS.slice(0, question.choices.length).split("").filter((c) => c !== question.correctChoice);
      // A preferred distractor plus other wrong choices gives a non-uniform, repeatable distribution.
      const preferred = rand.pick(wrong, `misconception:${question.prompt}`);
      const choice = blank ? null : correct ? question.correctChoice
        : rand.unit(`${key}:preferred`) < 0.6 ? preferred : rand.pick(wrong, `${key}:wrong`);
      return { questionId: question.id, partId: part.id, choice, textAnswer: null,
        score: correct ? question.maxScore : 0 };
    }
    const quality = blank ? "blank" : correct ? "complete" : rand.unit(`${key}:partial`) < 0.7 ? "partial" : "incorrect";
    const score = quality === "complete" ? question.maxScore : quality === "partial"
      ? Math.min(question.maxScore - 0.5, Math.max(0.5, Math.round(question.maxScore * (0.25 + 0.5 * rand.unit(`${key}:credit`)) * 2) / 2)) : 0;
    return { questionId: question.id, partId: part.id, choice: null, textAnswer: null, score, quality };
  }

  for (const r of scenario.assignmentResults) {
    r.answers = [];
    if (!r.receivedAt) continue;
    const a = assignments.get(r.assignmentId);
    // Include partial grading among current work without losing the other five states.
    if (a.kind === "current" && scenario.students.findIndex((s) => s.id === r.studentId) % 6 === 0) {
      r.state = "partially_marked";
      r.late = false;
      r.receivedAt = after(a.assignedAt, 2);
      r.gradedAt = after(r.receivedAt, 1);
      r.announcedAt = null;
      r.gradedById ??= scenario.staff.find((s) => s.role === "instructor" && !s.placeholder).id;
    }
    if (r.state === "received_unmarked") continue;
    const markedParts = r.state === "partially_marked" ? a.parts.slice(0, 1) : a.parts;
    r.answers = markedParts.flatMap((part) => part.questions.map((q) => answer(q, students.get(r.studentId), a, part, `${r.key}:${q.key}`)));
    r.components = markedParts.map((part) => ({ partId: part.id,
      score: sum(r.answers.filter((x) => x.partId === part.id)), fromAnswers: true }));
    r.total = r.state === "partially_marked" ? null : sum(r.components);
  }

  const ordinal = new Map();
  for (const r of scenario.examResults) {
    const exam = exams.get(r.examId);
    if (exam.format === "paper") continue;
    r.answers = [];
    if (!r.receivedAt) continue;
    const index = ordinal.get(exam.id) ?? 0;
    ordinal.set(exam.id, index + 1);
    const manual = exam.questions.filter((q) => !q.choices);
    r.state = manual.length ? ["received_unmarked", "partially_marked", "marked_private", "announced", "announced"][index % 5] : "announced";
    const start = Date.parse(exam.opensAt);
    const reason = index % 4 === 0 ? "timer" : "submitted";
    r.attempt = { id: rand.uuid(`${r.key}:attempt`), startedAt: exam.opensAt,
      deadlineAt: new Date(start + 60 * MINUTE).toISOString(), reason };
    r.receivedAt = new Date(start + (reason === "timer" ? 60 : 25 + Math.floor(rand.unit(`${r.key}:duration`) * 25)) * MINUTE).toISOString();
    r.gradedAt = manual.length ? r.state === "received_unmarked" ? null : after(r.receivedAt, 1) : r.receivedAt;
    r.announcedAt = r.state === "announced" ? manual.length ? after(r.receivedAt, 2) : r.receivedAt : null;
    r.answers = exam.questions.map((q) => {
      const part = exam.parts.find((p) => p.id === q.partId);
      const result = answer(q, students.get(r.studentId), exam, part, `${r.key}:${q.key}`);
      if (!q.choices) {
        const variants = WRITTEN[manual.findIndex((x) => x.id === q.id)];
        result.textAnswer = result.quality === "blank" ? null : result.quality === "complete" ? q.modelAnswer : variants[result.quality];
        if (r.state === "received_unmarked" || (r.state === "partially_marked" && q.id !== manual[0].id)) result.score = null;
      }
      return result;
    });
    r.components = r.answers.filter((a) => a.score !== null).map((a) => ({ partId: a.questionId, score: a.score }));
    r.total = ["received_unmarked", "partially_marked"].includes(r.state) ? null : sum(r.components);
  }
}
