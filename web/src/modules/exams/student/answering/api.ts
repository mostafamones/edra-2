import {
  claimStudentExamEditor, readStudentExamAnswering, recordStudentExamDeparture, releaseStudentExamEditor, renewStudentExamEditor,
  saveStudentExamAnswers, submitStudentExam,
} from "../actions";
import { studentFailure } from "../errors";
import type { AnsweringApi } from "./controller";

/** Transport failures leave the command's outcome unknown. The controller retains its exact request. */
const safe = async <T>(run: () => Promise<T>) => {
  try { return await run(); } catch { return studentFailure("unavailable"); }
};

export function answeringApi(academyId: string, examId: string): AnsweringApi {
  const scope = { academyId, examId };
  return {
    read: (token) => safe(() => readStudentExamAnswering({ ...scope, token })),
    heartbeat: (token) => safe(() => renewStudentExamEditor({ ...scope, token })),
    claim: (token) => safe(() => claimStudentExamEditor({ ...scope, token })),
    release: (token) => safe(() => releaseStudentExamEditor({ ...scope, token })),
    save: (token, expectedVersion, answers, key, generation) => safe(() => saveStudentExamAnswers({ ...scope, token, expectedVersion, answers, key, generation })),
    submit: (token, expectedVersion, key, generation) => safe(() => submitStudentExam({ ...scope, token, expectedVersion, key, generation })),
    departure: (token, eventId, questionId, generation) => safe(() => recordStudentExamDeparture({ ...scope, token, eventId, questionId, generation })),
  };
}
