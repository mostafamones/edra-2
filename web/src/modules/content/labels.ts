import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  setUnitLabel as setUnitLabelServer,
} from "./labels.server";

const setUnitLabelFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => setUnitLabelServer(...(data.args as Parameters<typeof setUnitLabelServer>)));

export async function setUnitLabel(...args: Parameters<typeof setUnitLabelServer>): Promise<Awaited<ReturnType<typeof setUnitLabelServer>>> {
  return setUnitLabelFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof setUnitLabelServer>>>;
}
