import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { setStudentRecordsLabel as setStudentRecordsLabelServer } from "./labels.server";

const setStudentRecordsLabelFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => setStudentRecordsLabelServer(...(data.args as Parameters<typeof setStudentRecordsLabelServer>)));

export async function setStudentRecordsLabel(...args: Parameters<typeof setStudentRecordsLabelServer>): Promise<Awaited<ReturnType<typeof setStudentRecordsLabelServer>>> {
  return setStudentRecordsLabelFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof setStudentRecordsLabelServer>>>;
}
