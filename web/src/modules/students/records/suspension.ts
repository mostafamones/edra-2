import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  previewStudentSuspension as previewStudentSuspensionServer,
  setStudentSuspension as setStudentSuspensionServer,
} from "./suspension.server";

const previewStudentSuspensionFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => previewStudentSuspensionServer(...(data.args as Parameters<typeof previewStudentSuspensionServer>)));

export async function previewStudentSuspension(...args: Parameters<typeof previewStudentSuspensionServer>): Promise<Awaited<ReturnType<typeof previewStudentSuspensionServer>>> {
  return previewStudentSuspensionFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof previewStudentSuspensionServer>>>;
}

const setStudentSuspensionFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => setStudentSuspensionServer(...(data.args as Parameters<typeof setStudentSuspensionServer>)));

export async function setStudentSuspension(...args: Parameters<typeof setStudentSuspensionServer>): Promise<Awaited<ReturnType<typeof setStudentSuspensionServer>>> {
  return setStudentSuspensionFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof setStudentSuspensionServer>>>;
}
