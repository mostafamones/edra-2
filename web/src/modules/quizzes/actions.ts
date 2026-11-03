import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  createNewQuiz as createNewQuizServer,
  saveQuiz as saveQuizServer,
  setQuizAvailability as setQuizAvailabilityServer,
  archiveExistingQuiz as archiveExistingQuizServer,
  correctQuizKey as correctQuizKeyServer,
  excludeQuizQuestion as excludeQuizQuestionServer,
  savePhysicalAnswers as savePhysicalAnswersServer,
  confirmPhysicalWork as confirmPhysicalWorkServer,
  saveQuizMarks as saveQuizMarksServer,
  announceQuizResults as announceQuizResultsServer,
} from "./actions.server";

const createNewQuizFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => createNewQuizServer(data.value as Parameters<typeof createNewQuizServer>[0]));

export async function createNewQuiz(value: Parameters<typeof createNewQuizServer>[0]): ReturnType<typeof createNewQuizServer> {
  return createNewQuizFn({ data: { value } }) as ReturnType<typeof createNewQuizServer>;
}

const saveQuizFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => saveQuizServer(data.value as Parameters<typeof saveQuizServer>[0]));

export async function saveQuiz(value: Parameters<typeof saveQuizServer>[0]): ReturnType<typeof saveQuizServer> {
  return saveQuizFn({ data: { value } }) as ReturnType<typeof saveQuizServer>;
}

const setQuizAvailabilityFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => setQuizAvailabilityServer(data.value as Parameters<typeof setQuizAvailabilityServer>[0]));

export async function setQuizAvailability(value: Parameters<typeof setQuizAvailabilityServer>[0]): ReturnType<typeof setQuizAvailabilityServer> {
  return setQuizAvailabilityFn({ data: { value } }) as ReturnType<typeof setQuizAvailabilityServer>;
}

const archiveExistingQuizFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => archiveExistingQuizServer(data.value as Parameters<typeof archiveExistingQuizServer>[0]));

export async function archiveExistingQuiz(value: Parameters<typeof archiveExistingQuizServer>[0]): ReturnType<typeof archiveExistingQuizServer> {
  return archiveExistingQuizFn({ data: { value } }) as ReturnType<typeof archiveExistingQuizServer>;
}

const correctQuizKeyFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => correctQuizKeyServer(data.value as Parameters<typeof correctQuizKeyServer>[0]));

export async function correctQuizKey(value: Parameters<typeof correctQuizKeyServer>[0]): ReturnType<typeof correctQuizKeyServer> {
  return correctQuizKeyFn({ data: { value } }) as ReturnType<typeof correctQuizKeyServer>;
}

const excludeQuizQuestionFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => excludeQuizQuestionServer(data.value as Parameters<typeof excludeQuizQuestionServer>[0]));

export async function excludeQuizQuestion(value: Parameters<typeof excludeQuizQuestionServer>[0]): ReturnType<typeof excludeQuizQuestionServer> {
  return excludeQuizQuestionFn({ data: { value } }) as ReturnType<typeof excludeQuizQuestionServer>;
}

const savePhysicalAnswersFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => savePhysicalAnswersServer(data.value as Parameters<typeof savePhysicalAnswersServer>[0]));

export async function savePhysicalAnswers(value: Parameters<typeof savePhysicalAnswersServer>[0]): ReturnType<typeof savePhysicalAnswersServer> {
  return savePhysicalAnswersFn({ data: { value } }) as ReturnType<typeof savePhysicalAnswersServer>;
}

const confirmPhysicalWorkFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => confirmPhysicalWorkServer(data.value as Parameters<typeof confirmPhysicalWorkServer>[0]));

export async function confirmPhysicalWork(value: Parameters<typeof confirmPhysicalWorkServer>[0]): ReturnType<typeof confirmPhysicalWorkServer> {
  return confirmPhysicalWorkFn({ data: { value } }) as ReturnType<typeof confirmPhysicalWorkServer>;
}

const saveQuizMarksFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => saveQuizMarksServer(data.value as Parameters<typeof saveQuizMarksServer>[0]));

export async function saveQuizMarks(value: Parameters<typeof saveQuizMarksServer>[0]): ReturnType<typeof saveQuizMarksServer> {
  return saveQuizMarksFn({ data: { value } }) as ReturnType<typeof saveQuizMarksServer>;
}

const announceQuizResultsFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => announceQuizResultsServer(data.value as Parameters<typeof announceQuizResultsServer>[0]));

export async function announceQuizResults(value: Parameters<typeof announceQuizResultsServer>[0]): ReturnType<typeof announceQuizResultsServer> {
  return announceQuizResultsFn({ data: { value } }) as ReturnType<typeof announceQuizResultsServer>;
}
