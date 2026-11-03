import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  createNewAssignment as createNewAssignmentServer,
  saveAssignment as saveAssignmentServer,
  changeAssignment as changeAssignmentServer,
  saveStudentMarks as saveStudentMarksServer,
  recordStudentWork as recordStudentWorkServer,
  announceStudentResults as announceStudentResultsServer,
  lookUpStudent as lookUpStudentServer,
  correctAssignmentKey as correctAssignmentKeyServer,
  excludeAssignmentQuestion as excludeAssignmentQuestionServer,
  loadReceivedFiles as loadReceivedFilesServer,
  openAssignmentReceivedFile as openAssignmentReceivedFileServer,
  loadOnlineSetting as loadOnlineSettingServer,
  changeOnlineSetting as changeOnlineSettingServer,
  loadAnswerAccess as loadAnswerAccessServer,
  changeStudentAnswerAccess as changeStudentAnswerAccessServer,
} from "./actions.server";

const createNewAssignmentFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => createNewAssignmentServer(data.value as Parameters<typeof createNewAssignmentServer>[0]));

export async function createNewAssignment(value: Parameters<typeof createNewAssignmentServer>[0]): ReturnType<typeof createNewAssignmentServer> {
  return createNewAssignmentFn({ data: { value } }) as ReturnType<typeof createNewAssignmentServer>;
}

const saveAssignmentFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => saveAssignmentServer(data.value as Parameters<typeof saveAssignmentServer>[0]));

export async function saveAssignment(value: Parameters<typeof saveAssignmentServer>[0]): ReturnType<typeof saveAssignmentServer> {
  return saveAssignmentFn({ data: { value } }) as ReturnType<typeof saveAssignmentServer>;
}

const changeAssignmentFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => changeAssignmentServer(data.value as Parameters<typeof changeAssignmentServer>[0]));

export async function changeAssignment(value: Parameters<typeof changeAssignmentServer>[0]): ReturnType<typeof changeAssignmentServer> {
  return changeAssignmentFn({ data: { value } }) as ReturnType<typeof changeAssignmentServer>;
}

const saveStudentMarksFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => saveStudentMarksServer(data.value as Parameters<typeof saveStudentMarksServer>[0]));

export async function saveStudentMarks(value: Parameters<typeof saveStudentMarksServer>[0]): ReturnType<typeof saveStudentMarksServer> {
  return saveStudentMarksFn({ data: { value } }) as ReturnType<typeof saveStudentMarksServer>;
}

const recordStudentWorkFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => recordStudentWorkServer(data.value as Parameters<typeof recordStudentWorkServer>[0]));

export async function recordStudentWork(value: Parameters<typeof recordStudentWorkServer>[0]): ReturnType<typeof recordStudentWorkServer> {
  return recordStudentWorkFn({ data: { value } }) as ReturnType<typeof recordStudentWorkServer>;
}

const announceStudentResultsFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => announceStudentResultsServer(data.value as Parameters<typeof announceStudentResultsServer>[0]));

export async function announceStudentResults(value: Parameters<typeof announceStudentResultsServer>[0]): ReturnType<typeof announceStudentResultsServer> {
  return announceStudentResultsFn({ data: { value } }) as ReturnType<typeof announceStudentResultsServer>;
}

const lookUpStudentFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => lookUpStudentServer(data.value as Parameters<typeof lookUpStudentServer>[0]));

export async function lookUpStudent(value: Parameters<typeof lookUpStudentServer>[0]): ReturnType<typeof lookUpStudentServer> {
  return lookUpStudentFn({ data: { value } }) as ReturnType<typeof lookUpStudentServer>;
}

const correctAssignmentKeyFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => correctAssignmentKeyServer(data.value as Parameters<typeof correctAssignmentKeyServer>[0]));

export async function correctAssignmentKey(value: Parameters<typeof correctAssignmentKeyServer>[0]): ReturnType<typeof correctAssignmentKeyServer> {
  return correctAssignmentKeyFn({ data: { value } }) as ReturnType<typeof correctAssignmentKeyServer>;
}

const excludeAssignmentQuestionFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => excludeAssignmentQuestionServer(data.value as Parameters<typeof excludeAssignmentQuestionServer>[0]));

export async function excludeAssignmentQuestion(value: Parameters<typeof excludeAssignmentQuestionServer>[0]): ReturnType<typeof excludeAssignmentQuestionServer> {
  return excludeAssignmentQuestionFn({ data: { value } }) as ReturnType<typeof excludeAssignmentQuestionServer>;
}

const loadReceivedFilesFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => loadReceivedFilesServer(data.value as Parameters<typeof loadReceivedFilesServer>[0]));

export async function loadReceivedFiles(value: Parameters<typeof loadReceivedFilesServer>[0]): ReturnType<typeof loadReceivedFilesServer> {
  return loadReceivedFilesFn({ data: { value } }) as ReturnType<typeof loadReceivedFilesServer>;
}

const openAssignmentReceivedFileFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => openAssignmentReceivedFileServer(data.value as Parameters<typeof openAssignmentReceivedFileServer>[0]));

export async function openAssignmentReceivedFile(value: Parameters<typeof openAssignmentReceivedFileServer>[0]): ReturnType<typeof openAssignmentReceivedFileServer> {
  return openAssignmentReceivedFileFn({ data: { value } }) as ReturnType<typeof openAssignmentReceivedFileServer>;
}

const loadOnlineSettingFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.string() }))
  .handler(({ data }) => loadOnlineSettingServer(data.value as Parameters<typeof loadOnlineSettingServer>[0]));

export async function loadOnlineSetting(value: Parameters<typeof loadOnlineSettingServer>[0]): ReturnType<typeof loadOnlineSettingServer> {
  return loadOnlineSettingFn({ data: { value } }) as ReturnType<typeof loadOnlineSettingServer>;
}

const changeOnlineSettingFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => changeOnlineSettingServer(data.value as Parameters<typeof changeOnlineSettingServer>[0]));

export async function changeOnlineSetting(value: Parameters<typeof changeOnlineSettingServer>[0]): ReturnType<typeof changeOnlineSettingServer> {
  return changeOnlineSettingFn({ data: { value } }) as ReturnType<typeof changeOnlineSettingServer>;
}

const loadAnswerAccessFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => loadAnswerAccessServer(data.value as Parameters<typeof loadAnswerAccessServer>[0]));

export async function loadAnswerAccess(value: Parameters<typeof loadAnswerAccessServer>[0]): ReturnType<typeof loadAnswerAccessServer> {
  return loadAnswerAccessFn({ data: { value } }) as ReturnType<typeof loadAnswerAccessServer>;
}

const changeStudentAnswerAccessFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => changeStudentAnswerAccessServer(data.value as Parameters<typeof changeStudentAnswerAccessServer>[0]));

export async function changeStudentAnswerAccess(value: Parameters<typeof changeStudentAnswerAccessServer>[0]): ReturnType<typeof changeStudentAnswerAccessServer> {
  return changeStudentAnswerAccessFn({ data: { value } }) as ReturnType<typeof changeStudentAnswerAccessServer>;
}
