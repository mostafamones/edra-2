// edra-dev-v3 assessment content: real programming assignments and exams from the committed bank (bank/README.md).
// Preparatory groups follow JavaScript Basics, secondary groups C++ Fundamentals; both start with Programming
// Foundations. Pure and keyed like the rest of the builder: a group's k-th assignment or paper exam follows its
// course order, and the variant and choice order are keyed draws.
import { cplusplus } from "./bank/cpp.mjs";
import { foundations } from "./bank/foundations.mjs";
import { javascript } from "./bank/javascript.mjs";

export const COURSES = Object.freeze({ "preparatory-3": javascript, "secondary-2": cplusplus });
const LETTERS = "ABCDEFGHIJ";

const promptOf = (item) => (item.code ? `${item.prompt}\n\n${item.code}` : item.prompt);
const sum = (list) => list.reduce((total, item) => total + item.maxScore, 0);
// Past the end of a course, its sequence repeats as revision.
const cycle = (list, ordinal) => ({ item: list[ordinal % list.length], round: Math.floor(ordinal / list.length) });
const titled = (title, round) => (round ? `${title} (revision ${round})` : title);

export function programmingContent(rand) {
  const courseOf = (levelKey) => {
    if (!Object.hasOwn(COURSES, levelKey)) throw new RangeError(`No course for level ${levelKey}`);
    return COURSES[levelKey];
  };

  // Choices are authored correct-first; each exam question gets its own stable order.
  const shuffled = (choices, key) => {
    const order = choices.map((label, i) => ({ label, i, u: rand.unit(`${key}:choice:${i}`) })).sort((a, b) => a.u - b.u || a.i - b.i);
    return { choices: order.map((c) => c.label), correctChoice: LETTERS[order.findIndex((c) => c.i === 0)] };
  };

  return {
    subject: "Programming",

    assignment({ key, levelKey, ordinal }) {
      const course = courseOf(levelKey);
      const slots = [foundations.assignments, ...course.assignments];
      const { item: variants, round } = cycle(slots, ordinal);
      const pick = rand.pick(variants, `${key}:variant`);
      const pack = slots.indexOf(variants) === 0 ? foundations : course;
      const parts = pick.parts.map((part, p) => {
        const partKey = `${key}:part${p + 1}`;
        const questions = part.questions.map((q, n) => ({
          id: rand.uuid(`${partKey}:q${n + 1}`), key: `${partKey}:q${n + 1}`, position: n + 1, prompt: promptOf(q), maxScore: q.marks,
        }));
        return { id: rand.uuid(partKey), key: partKey, title: part.title, kind: "file_upload", instructions: part.instructions, maxScore: sum(questions), questions };
      });
      return { title: titled(pick.title, round), instructions: pick.instructions, pack: pack.id, unit: pack.units[pick.unit], bankId: pick.id, parts };
    },

    paperExam({ key, levelKey, ordinal }) {
      const course = courseOf(levelKey);
      const { item, round } = cycle(course.paperExams, ordinal);
      return { ...examBody(key, item, () => "written_work"), title: titled(item.title, round), pack: course.id };
    },

    practiceExam({ key, levelKey }) {
      const course = courseOf(levelKey);
      const item = course.practiceExam;
      const body = examBody(key, item, (part) => part.kind);
      const choiceOnly = body.parts.every((part) => part.kind === "question_sheet");
      return { format: choiceOnly ? "mcq" : "online", ...body, title: item.title, pack: course.id };
    },
  };

  function examBody(key, item, kindOf) {
    const parts = [];
    const questions = [];
    item.parts.forEach((part, p) => {
      const partKey = `${key}:part${p + 1}`;
      const kind = kindOf(part);
      parts.push({ id: rand.uuid(partKey), key: partKey, position: p + 1, title: part.title, kind, instructions: part.instructions });
      part.questions.forEach((q, n) => {
        const qKey = `${partKey}:q${n + 1}`;
        const question = {
          id: rand.uuid(qKey), key: qKey, partId: rand.uuid(partKey), position: n + 1, maxScore: q.marks, prompt: promptOf(q),
          modelAnswer: kind === "question_sheet" ? q.explanation : q.answer,
        };
        questions.push(kind === "question_sheet" ? { ...question, ...shuffled(q.choices, qKey) } : question);
      });
    });
    return { instructions: item.instructions, solutionNotes: item.solutionNotes, bankId: item.id, parts, questions };
  }
}
