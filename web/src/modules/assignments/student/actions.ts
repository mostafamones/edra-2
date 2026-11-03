import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  claimAssignmentEditor as claimAssignmentEditorServer,
  renewAssignmentEditor as renewAssignmentEditorServer,
  readAssignmentEditor as readAssignmentEditorServer,
  saveAssignmentAnswers as saveAssignmentAnswersServer,
  submitAssignment as submitAssignmentServer,
  startAssignmentUpload as startAssignmentUploadServer,
  finishAssignmentUpload as finishAssignmentUploadServer,
  removeAssignmentFile as removeAssignmentFileServer,
  signAssignmentImages as signAssignmentImagesServer,
} from "./actions.server";

const claimAssignmentEditorFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => claimAssignmentEditorServer(data.value as Parameters<typeof claimAssignmentEditorServer>[0]));

export async function claimAssignmentEditor(value: Parameters<typeof claimAssignmentEditorServer>[0]): ReturnType<typeof claimAssignmentEditorServer> {
  return claimAssignmentEditorFn({ data: { value } }) as ReturnType<typeof claimAssignmentEditorServer>;
}

const renewAssignmentEditorFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => renewAssignmentEditorServer(data.value as Parameters<typeof renewAssignmentEditorServer>[0]));

export async function renewAssignmentEditor(value: Parameters<typeof renewAssignmentEditorServer>[0]): ReturnType<typeof renewAssignmentEditorServer> {
  return renewAssignmentEditorFn({ data: { value } }) as ReturnType<typeof renewAssignmentEditorServer>;
}

const readAssignmentEditorFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => readAssignmentEditorServer(data.value as Parameters<typeof readAssignmentEditorServer>[0]));

export async function readAssignmentEditor(value: Parameters<typeof readAssignmentEditorServer>[0]): ReturnType<typeof readAssignmentEditorServer> {
  return readAssignmentEditorFn({ data: { value } }) as ReturnType<typeof readAssignmentEditorServer>;
}

const saveAssignmentAnswersFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => saveAssignmentAnswersServer(data.value as Parameters<typeof saveAssignmentAnswersServer>[0]));

export async function saveAssignmentAnswers(value: Parameters<typeof saveAssignmentAnswersServer>[0]): ReturnType<typeof saveAssignmentAnswersServer> {
  return saveAssignmentAnswersFn({ data: { value } }) as ReturnType<typeof saveAssignmentAnswersServer>;
}

const submitAssignmentFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => submitAssignmentServer(data.value as Parameters<typeof submitAssignmentServer>[0]));

export async function submitAssignment(value: Parameters<typeof submitAssignmentServer>[0]): ReturnType<typeof submitAssignmentServer> {
  return submitAssignmentFn({ data: { value } }) as ReturnType<typeof submitAssignmentServer>;
}

const startAssignmentUploadFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => startAssignmentUploadServer(data.value as Parameters<typeof startAssignmentUploadServer>[0]));

export async function startAssignmentUpload(value: Parameters<typeof startAssignmentUploadServer>[0]): ReturnType<typeof startAssignmentUploadServer> {
  return startAssignmentUploadFn({ data: { value } }) as ReturnType<typeof startAssignmentUploadServer>;
}

const finishAssignmentUploadFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => finishAssignmentUploadServer(data.value as Parameters<typeof finishAssignmentUploadServer>[0]));

export async function finishAssignmentUpload(value: Parameters<typeof finishAssignmentUploadServer>[0]): ReturnType<typeof finishAssignmentUploadServer> {
  return finishAssignmentUploadFn({ data: { value } }) as ReturnType<typeof finishAssignmentUploadServer>;
}

const removeAssignmentFileFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => removeAssignmentFileServer(data.value as Parameters<typeof removeAssignmentFileServer>[0]));

export async function removeAssignmentFile(value: Parameters<typeof removeAssignmentFileServer>[0]): ReturnType<typeof removeAssignmentFileServer> {
  return removeAssignmentFileFn({ data: { value } }) as ReturnType<typeof removeAssignmentFileServer>;
}

const signAssignmentImagesFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => signAssignmentImagesServer(data.value as Parameters<typeof signAssignmentImagesServer>[0]));

export async function signAssignmentImages(value: Parameters<typeof signAssignmentImagesServer>[0]): ReturnType<typeof signAssignmentImagesServer> {
  return signAssignmentImagesFn({ data: { value } }) as ReturnType<typeof signAssignmentImagesServer>;
}
