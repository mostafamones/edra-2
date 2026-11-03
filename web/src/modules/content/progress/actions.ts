import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  startVideoProgress as startVideoProgressServer,
  saveVideoProgress as saveVideoProgressServer,
} from "./actions.server";

const startVideoProgressFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => startVideoProgressServer(...(data.args as Parameters<typeof startVideoProgressServer>)));

export async function startVideoProgress(...args: Parameters<typeof startVideoProgressServer>): Promise<Awaited<ReturnType<typeof startVideoProgressServer>>> {
  return startVideoProgressFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof startVideoProgressServer>>>;
}

const saveVideoProgressFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => saveVideoProgressServer(...(data.args as Parameters<typeof saveVideoProgressServer>)));

export async function saveVideoProgress(...args: Parameters<typeof saveVideoProgressServer>): Promise<Awaited<ReturnType<typeof saveVideoProgressServer>>> {
  return saveVideoProgressFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof saveVideoProgressServer>>>;
}
