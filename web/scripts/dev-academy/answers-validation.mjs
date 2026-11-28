// Answer-level invariants for v5. Null scores mean unmarked; numeric zero is a real mark.
export function validateAnswers(scenario) {
  const errors = [];
  const fail = (key, message) => errors.push(`${key}: ${message}`);
  const sum = (items) => Math.round(items.reduce((n, a) => n + a.score, 0) * 100) / 100;
  const assignments = new Map(scenario.assignments.map((a) => [a.id, a]));
  const exams = new Map(scenario.exams.map((e) => [e.id, e]));
  for (const r of [...scenario.assignmentResults, ...scenario.examResults]) {
    const assignment = assignments.get(r.assignmentId);
    const exam = exams.get(r.examId);
    if (exam?.format === "paper") continue;
    const assessment = assignment ?? exam;
    if (!assessment) continue;
    const questions = assignment ? assignment.parts.flatMap((p) => p.questions.map((q) => ({ ...q, partId: p.id }))) : exam.questions;
    const byId = new Map(questions.map((q) => [q.id, q]));
    const answers = r.answers ?? [];
    if (new Set(answers.map((a) => a.questionId)).size !== answers.length) fail(r.key, "duplicate answer");
    if (!r.receivedAt && answers.length) fail(r.key, "missing work has answers");
    for (const a of answers) {
      const q = byId.get(a.questionId);
      if (!q || q.partId !== a.partId) { fail(r.key, "answer references another question or part"); continue; }
      if (a.score !== null && (!Number.isFinite(a.score) || a.score < 0 || a.score > q.maxScore)) fail(r.key, "answer score is out of range");
      if (q.choices) {
        if (a.choice !== null && (!/^[A-J]$/.test(a.choice) || "ABCDEFGHIJ".indexOf(a.choice) >= q.choices.length)) fail(r.key, "unknown answer choice");
        if (a.textAnswer !== null || a.score !== (a.choice === q.correctChoice ? q.maxScore : 0)) fail(r.key, "choice score differs from key");
      } else {
        if (a.choice !== null) fail(r.key, "written answer has a choice");
        if (a.textAnswer !== null && (typeof a.textAnswer !== "string" || !a.textAnswer.trim() || a.textAnswer.length > 10000)) fail(r.key, "invalid written answer text");
      }
    }
    const components = r.components ?? [];
    if (new Set(components.map((c) => c.partId)).size !== components.length) fail(r.key, "duplicate mark component");
    if (assignment) {
      for (const c of components) {
        const part = assignment.parts.find((p) => p.id === c.partId);
        const rows = answers.filter((a) => a.partId === c.partId);
        if (!part || !c.fromAnswers || rows.length !== part.questions.length || rows.some((a) => a.score === null) || sum(rows) !== c.score) fail(r.key, "part mark differs from question answers");
      }
      if (answers.some((a) => !components.some((c) => c.partId === a.partId))) fail(r.key, "question answer has no derived part mark");
    } else if (r.receivedAt) {
      if (!r.attempt || answers.length !== questions.length) fail(r.key, "online work needs an attempt and all answer slots");
      if (r.attempt) {
        const start = Date.parse(r.attempt.startedAt);
        const end = Date.parse(r.receivedAt);
        const deadline = Date.parse(r.attempt.deadlineAt);
        if (start < Date.parse(exam.opensAt) || start >= Date.parse(exam.scheduledClosesAt) || deadline !== start + exam.timerMinutes * 60000
          || end < start || end > Math.min(deadline, Date.parse(exam.closesAt))) fail(r.key, "attempt timeline is invalid");
        if (!["timer", "submitted"].includes(r.attempt.reason) || (r.attempt.reason === "timer" && end !== deadline)) fail(r.key, "attempt finalization is invalid");
      }
      for (const c of components) {
        const a = answers.find((x) => x.questionId === c.partId);
        if (!a || a.score === null || a.score !== c.score) fail(r.key, "exam mark differs from its answer");
      }
      if (answers.filter((a) => a.score !== null).length !== components.length) fail(r.key, "scored answer has no mark component");
    }
    if (r.total !== null && sum(components) !== r.total) fail(r.key, "total differs from question scores");
    if (r.state === "partially_marked") {
      const required = assignment ? assignment.parts.length : questions.length;
      if (!components.length || components.length >= required || r.total !== null || r.announcedAt !== null) fail(r.key, "partial marking must remain incomplete and private");
    }
    if (r.total !== null && components.length !== (assignment ? assignment.parts.length : questions.length)) fail(r.key, "complete result lacks marks");
  }
  return errors;
}
