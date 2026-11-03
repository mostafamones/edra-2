import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  saveStudentCodeSettings as saveStudentCodeSettingsServer,
  changeStudentCode as changeStudentCodeServer,
  peekNextStudentCode as peekNextStudentCodeServer,
  previewStudentCodeGeneration as previewStudentCodeGenerationServer,
  generateStudentCodes as generateStudentCodesServer,
} from "./actions.server";

const saveStudentCodeSettingsFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => saveStudentCodeSettingsServer(...(data.args as Parameters<typeof saveStudentCodeSettingsServer>)));

export async function saveStudentCodeSettings(...args: Parameters<typeof saveStudentCodeSettingsServer>): Promise<Awaited<ReturnType<typeof saveStudentCodeSettingsServer>>> {
  return saveStudentCodeSettingsFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof saveStudentCodeSettingsServer>>>;
}

const changeStudentCodeFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => changeStudentCodeServer(...(data.args as Parameters<typeof changeStudentCodeServer>)));

export async function changeStudentCode(...args: Parameters<typeof changeStudentCodeServer>): Promise<Awaited<ReturnType<typeof changeStudentCodeServer>>> {
  return changeStudentCodeFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof changeStudentCodeServer>>>;
}

const peekNextStudentCodeFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown()]) }))
  .handler(({ data }) => peekNextStudentCodeServer(...(data.args as Parameters<typeof peekNextStudentCodeServer>)));

export async function peekNextStudentCode(...args: Parameters<typeof peekNextStudentCodeServer>): Promise<Awaited<ReturnType<typeof peekNextStudentCodeServer>>> {
  return peekNextStudentCodeFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof peekNextStudentCodeServer>>>;
}

const previewStudentCodeGenerationFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => previewStudentCodeGenerationServer(...(data.args as Parameters<typeof previewStudentCodeGenerationServer>)));

export async function previewStudentCodeGeneration(...args: Parameters<typeof previewStudentCodeGenerationServer>): Promise<Awaited<ReturnType<typeof previewStudentCodeGenerationServer>>> {
  return previewStudentCodeGenerationFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof previewStudentCodeGenerationServer>>>;
}

const generateStudentCodesFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => generateStudentCodesServer(...(data.args as Parameters<typeof generateStudentCodesServer>)));

export async function generateStudentCodes(...args: Parameters<typeof generateStudentCodesServer>): Promise<Awaited<ReturnType<typeof generateStudentCodesServer>>> {
  return generateStudentCodesFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof generateStudentCodesServer>>>;
}
