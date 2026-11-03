import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  startStudentImport as startStudentImportServer,
  stageStudentImportRows as stageStudentImportRowsServer,
  finalizeStudentImportPreview as finalizeStudentImportPreviewServer,
  correctStudentImportRow as correctStudentImportRowServer,
  setStudentImportRowExcluded as setStudentImportRowExcludedServer,
  removeStudentImportEntries as removeStudentImportEntriesServer,
  confirmStudentImport as confirmStudentImportServer,
  processStudentImportBatch as processStudentImportBatchServer,
  cancelStudentImport as cancelStudentImportServer,
} from "./actions.server";
export type { ImportSourceMetadata } from "./actions.server";

const startStudentImportFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown(), z.unknown()]) }))
  .handler(({ data }) => startStudentImportServer(...(data.args as Parameters<typeof startStudentImportServer>)));

export async function startStudentImport(...args: Parameters<typeof startStudentImportServer>): Promise<Awaited<ReturnType<typeof startStudentImportServer>>> {
  return startStudentImportFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof startStudentImportServer>>>;
}

const stageStudentImportRowsFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown()]) }))
  .handler(({ data }) => stageStudentImportRowsServer(...(data.args as Parameters<typeof stageStudentImportRowsServer>)));

export async function stageStudentImportRows(...args: Parameters<typeof stageStudentImportRowsServer>): Promise<Awaited<ReturnType<typeof stageStudentImportRowsServer>>> {
  return stageStudentImportRowsFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof stageStudentImportRowsServer>>>;
}

const finalizeStudentImportPreviewFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => finalizeStudentImportPreviewServer(...(data.args as Parameters<typeof finalizeStudentImportPreviewServer>)));

export async function finalizeStudentImportPreview(...args: Parameters<typeof finalizeStudentImportPreviewServer>): Promise<Awaited<ReturnType<typeof finalizeStudentImportPreviewServer>>> {
  return finalizeStudentImportPreviewFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof finalizeStudentImportPreviewServer>>>;
}

const correctStudentImportRowFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown(), z.unknown(), z.unknown()]) }))
  .handler(({ data }) => correctStudentImportRowServer(...(data.args as Parameters<typeof correctStudentImportRowServer>)));

export async function correctStudentImportRow(...args: Parameters<typeof correctStudentImportRowServer>): Promise<Awaited<ReturnType<typeof correctStudentImportRowServer>>> {
  return correctStudentImportRowFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof correctStudentImportRowServer>>>;
}

const setStudentImportRowExcludedFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown(), z.unknown(), z.unknown()]) }))
  .handler(({ data }) => setStudentImportRowExcludedServer(...(data.args as Parameters<typeof setStudentImportRowExcludedServer>)));

export async function setStudentImportRowExcluded(...args: Parameters<typeof setStudentImportRowExcludedServer>): Promise<Awaited<ReturnType<typeof setStudentImportRowExcludedServer>>> {
  return setStudentImportRowExcludedFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof setStudentImportRowExcludedServer>>>;
}

const removeStudentImportEntriesFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown(), z.unknown()]) }))
  .handler(({ data }) => removeStudentImportEntriesServer(...(data.args as Parameters<typeof removeStudentImportEntriesServer>)));

export async function removeStudentImportEntries(...args: Parameters<typeof removeStudentImportEntriesServer>): Promise<Awaited<ReturnType<typeof removeStudentImportEntriesServer>>> {
  return removeStudentImportEntriesFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof removeStudentImportEntriesServer>>>;
}

const confirmStudentImportFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown()]) }))
  .handler(({ data }) => confirmStudentImportServer(...(data.args as Parameters<typeof confirmStudentImportServer>)));

export async function confirmStudentImport(...args: Parameters<typeof confirmStudentImportServer>): Promise<Awaited<ReturnType<typeof confirmStudentImportServer>>> {
  return confirmStudentImportFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof confirmStudentImportServer>>>;
}

const processStudentImportBatchFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown()]) }))
  .handler(({ data }) => processStudentImportBatchServer(...(data.args as Parameters<typeof processStudentImportBatchServer>)));

export async function processStudentImportBatch(...args: Parameters<typeof processStudentImportBatchServer>): Promise<Awaited<ReturnType<typeof processStudentImportBatchServer>>> {
  return processStudentImportBatchFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof processStudentImportBatchServer>>>;
}

const cancelStudentImportFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => cancelStudentImportServer(...(data.args as Parameters<typeof cancelStudentImportServer>)));

export async function cancelStudentImport(...args: Parameters<typeof cancelStudentImportServer>): Promise<Awaited<ReturnType<typeof cancelStudentImportServer>>> {
  return cancelStudentImportFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof cancelStudentImportServer>>>;
}
