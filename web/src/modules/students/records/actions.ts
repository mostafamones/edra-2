import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  createStudentRecord as createStudentRecordServer,
  updateStudentRecord as updateStudentRecordServer,
  setStudentRecordsArchived as setStudentRecordsArchivedServer,
  previewStudentGroupChange as previewStudentGroupChangeServer,
  setStudentRecordsGroup as setStudentRecordsGroupServer,
} from "./actions.server";

const createStudentRecordFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => createStudentRecordServer(...(data.args as Parameters<typeof createStudentRecordServer>)));

export async function createStudentRecord(...args: Parameters<typeof createStudentRecordServer>): Promise<Awaited<ReturnType<typeof createStudentRecordServer>>> {
  return createStudentRecordFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof createStudentRecordServer>>>;
}

const updateStudentRecordFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown(), z.unknown()]) }))
  .handler(({ data }) => updateStudentRecordServer(...(data.args as Parameters<typeof updateStudentRecordServer>)));

export async function updateStudentRecord(...args: Parameters<typeof updateStudentRecordServer>): Promise<Awaited<ReturnType<typeof updateStudentRecordServer>>> {
  return updateStudentRecordFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof updateStudentRecordServer>>>;
}

const setStudentRecordsArchivedFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown(), z.unknown(), z.unknown()]) }))
  .handler(({ data }) => setStudentRecordsArchivedServer(...(data.args as Parameters<typeof setStudentRecordsArchivedServer>)));

export async function setStudentRecordsArchived(...args: Parameters<typeof setStudentRecordsArchivedServer>): Promise<Awaited<ReturnType<typeof setStudentRecordsArchivedServer>>> {
  return setStudentRecordsArchivedFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof setStudentRecordsArchivedServer>>>;
}

const previewStudentGroupChangeFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown(), z.unknown().optional()]) }))
  .handler(({ data }) => previewStudentGroupChangeServer(...(data.args as Parameters<typeof previewStudentGroupChangeServer>)));

export async function previewStudentGroupChange(...args: Parameters<typeof previewStudentGroupChangeServer>): Promise<Awaited<ReturnType<typeof previewStudentGroupChangeServer>>> {
  return previewStudentGroupChangeFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof previewStudentGroupChangeServer>>>;
}

const setStudentRecordsGroupFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown(), z.unknown()]) }))
  .handler(({ data }) => setStudentRecordsGroupServer(...(data.args as Parameters<typeof setStudentRecordsGroupServer>)));

export async function setStudentRecordsGroup(...args: Parameters<typeof setStudentRecordsGroupServer>): Promise<Awaited<ReturnType<typeof setStudentRecordsGroupServer>>> {
  return setStudentRecordsGroupFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof setStudentRecordsGroupServer>>>;
}
