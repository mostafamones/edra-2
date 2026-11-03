import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  enterStudentExam as enterStudentExamServer,
  claimStudentExamEditor as claimStudentExamEditorServer,
  renewStudentExamEditor as renewStudentExamEditorServer,
  releaseStudentExamEditor as releaseStudentExamEditorServer,
  readStudentExamAnswering as readStudentExamAnsweringServer,
  saveStudentExamAnswers as saveStudentExamAnswersServer,
  submitStudentExam as submitStudentExamServer,
  recordStudentExamDeparture as recordStudentExamDepartureServer,
  signStudentExamImages as signStudentExamImagesServer,
  signStudentExamReviewImages as signStudentExamReviewImagesServer,
} from "./actions.server";

const enterStudentExamFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => enterStudentExamServer(data.value as Parameters<typeof enterStudentExamServer>[0]));

export async function enterStudentExam(value: Parameters<typeof enterStudentExamServer>[0]): ReturnType<typeof enterStudentExamServer> {
  return enterStudentExamFn({ data: { value } }) as ReturnType<typeof enterStudentExamServer>;
}

const claimStudentExamEditorFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => claimStudentExamEditorServer(data.value as Parameters<typeof claimStudentExamEditorServer>[0]));

export async function claimStudentExamEditor(value: Parameters<typeof claimStudentExamEditorServer>[0]): ReturnType<typeof claimStudentExamEditorServer> {
  return claimStudentExamEditorFn({ data: { value } }) as ReturnType<typeof claimStudentExamEditorServer>;
}

const renewStudentExamEditorFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => renewStudentExamEditorServer(data.value as Parameters<typeof renewStudentExamEditorServer>[0]));

export async function renewStudentExamEditor(value: Parameters<typeof renewStudentExamEditorServer>[0]): ReturnType<typeof renewStudentExamEditorServer> {
  return renewStudentExamEditorFn({ data: { value } }) as ReturnType<typeof renewStudentExamEditorServer>;
}

const releaseStudentExamEditorFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => releaseStudentExamEditorServer(data.value as Parameters<typeof releaseStudentExamEditorServer>[0]));

export async function releaseStudentExamEditor(value: Parameters<typeof releaseStudentExamEditorServer>[0]): ReturnType<typeof releaseStudentExamEditorServer> {
  return releaseStudentExamEditorFn({ data: { value } }) as ReturnType<typeof releaseStudentExamEditorServer>;
}

const readStudentExamAnsweringFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => readStudentExamAnsweringServer(data.value as Parameters<typeof readStudentExamAnsweringServer>[0]));

export async function readStudentExamAnswering(value: Parameters<typeof readStudentExamAnsweringServer>[0]): ReturnType<typeof readStudentExamAnsweringServer> {
  return readStudentExamAnsweringFn({ data: { value } }) as ReturnType<typeof readStudentExamAnsweringServer>;
}

const saveStudentExamAnswersFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => saveStudentExamAnswersServer(data.value as Parameters<typeof saveStudentExamAnswersServer>[0]));

export async function saveStudentExamAnswers(value: Parameters<typeof saveStudentExamAnswersServer>[0]): ReturnType<typeof saveStudentExamAnswersServer> {
  return saveStudentExamAnswersFn({ data: { value } }) as ReturnType<typeof saveStudentExamAnswersServer>;
}

const submitStudentExamFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => submitStudentExamServer(data.value as Parameters<typeof submitStudentExamServer>[0]));

export async function submitStudentExam(value: Parameters<typeof submitStudentExamServer>[0]): ReturnType<typeof submitStudentExamServer> {
  return submitStudentExamFn({ data: { value } }) as ReturnType<typeof submitStudentExamServer>;
}

const recordStudentExamDepartureFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => recordStudentExamDepartureServer(data.value as Parameters<typeof recordStudentExamDepartureServer>[0]));

export async function recordStudentExamDeparture(value: Parameters<typeof recordStudentExamDepartureServer>[0]): ReturnType<typeof recordStudentExamDepartureServer> {
  return recordStudentExamDepartureFn({ data: { value } }) as ReturnType<typeof recordStudentExamDepartureServer>;
}

const signStudentExamImagesFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => signStudentExamImagesServer(data.value as Parameters<typeof signStudentExamImagesServer>[0]));

export async function signStudentExamImages(value: Parameters<typeof signStudentExamImagesServer>[0]): ReturnType<typeof signStudentExamImagesServer> {
  return signStudentExamImagesFn({ data: { value } }) as ReturnType<typeof signStudentExamImagesServer>;
}

const signStudentExamReviewImagesFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => signStudentExamReviewImagesServer(data.value as Parameters<typeof signStudentExamReviewImagesServer>[0]));

export async function signStudentExamReviewImages(value: Parameters<typeof signStudentExamReviewImagesServer>[0]): ReturnType<typeof signStudentExamReviewImagesServer> {
  return signStudentExamReviewImagesFn({ data: { value } }) as ReturnType<typeof signStudentExamReviewImagesServer>;
}
