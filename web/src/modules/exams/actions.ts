import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  createNewExam as createNewExamServer,
  saveExam as saveExamServer,
  setExamAvailability as setExamAvailabilityServer,
  archiveExistingExam as archiveExistingExamServer,
  correctExamKey as correctExamKeyServer,
  excludeExamQuestion as excludeExamQuestionServer,
  savePhysicalAnswers as savePhysicalAnswersServer,
  confirmPhysicalWork as confirmPhysicalWorkServer,
  saveExamMarks as saveExamMarksServer,
  announceExamResults as announceExamResultsServer,
} from "./actions.server";

const createNewExamFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => createNewExamServer(data.value as Parameters<typeof createNewExamServer>[0]));

export async function createNewExam(value: Parameters<typeof createNewExamServer>[0]): ReturnType<typeof createNewExamServer> {
  return createNewExamFn({ data: { value } }) as ReturnType<typeof createNewExamServer>;
}

const saveExamFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => saveExamServer(data.value as Parameters<typeof saveExamServer>[0]));

export async function saveExam(value: Parameters<typeof saveExamServer>[0]): ReturnType<typeof saveExamServer> {
  return saveExamFn({ data: { value } }) as ReturnType<typeof saveExamServer>;
}

const setExamAvailabilityFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => setExamAvailabilityServer(data.value as Parameters<typeof setExamAvailabilityServer>[0]));

export async function setExamAvailability(value: Parameters<typeof setExamAvailabilityServer>[0]): ReturnType<typeof setExamAvailabilityServer> {
  return setExamAvailabilityFn({ data: { value } }) as ReturnType<typeof setExamAvailabilityServer>;
}

const archiveExistingExamFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => archiveExistingExamServer(data.value as Parameters<typeof archiveExistingExamServer>[0]));

export async function archiveExistingExam(value: Parameters<typeof archiveExistingExamServer>[0]): ReturnType<typeof archiveExistingExamServer> {
  return archiveExistingExamFn({ data: { value } }) as ReturnType<typeof archiveExistingExamServer>;
}

const correctExamKeyFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => correctExamKeyServer(data.value as Parameters<typeof correctExamKeyServer>[0]));

export async function correctExamKey(value: Parameters<typeof correctExamKeyServer>[0]): ReturnType<typeof correctExamKeyServer> {
  return correctExamKeyFn({ data: { value } }) as ReturnType<typeof correctExamKeyServer>;
}

const excludeExamQuestionFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => excludeExamQuestionServer(data.value as Parameters<typeof excludeExamQuestionServer>[0]));

export async function excludeExamQuestion(value: Parameters<typeof excludeExamQuestionServer>[0]): ReturnType<typeof excludeExamQuestionServer> {
  return excludeExamQuestionFn({ data: { value } }) as ReturnType<typeof excludeExamQuestionServer>;
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

const saveExamMarksFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => saveExamMarksServer(data.value as Parameters<typeof saveExamMarksServer>[0]));

export async function saveExamMarks(value: Parameters<typeof saveExamMarksServer>[0]): ReturnType<typeof saveExamMarksServer> {
  return saveExamMarksFn({ data: { value } }) as ReturnType<typeof saveExamMarksServer>;
}

const announceExamResultsFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => announceExamResultsServer(data.value as Parameters<typeof announceExamResultsServer>[0]));

export async function announceExamResults(value: Parameters<typeof announceExamResultsServer>[0]): ReturnType<typeof announceExamResultsServer> {
  return announceExamResultsFn({ data: { value } }) as ReturnType<typeof announceExamResultsServer>;
}
