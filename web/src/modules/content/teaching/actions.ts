import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  loadTaught as loadTaughtServer,
  loadTaughtOptions as loadTaughtOptionsServer,
  saveTaught as saveTaughtServer,
} from "./actions.server";

const loadTaughtFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => loadTaughtServer(...(data.args as Parameters<typeof loadTaughtServer>)));

export async function loadTaught(...args: Parameters<typeof loadTaughtServer>): Promise<Awaited<ReturnType<typeof loadTaughtServer>>> {
  return loadTaughtFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof loadTaughtServer>>>;
}

const loadTaughtOptionsFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => loadTaughtOptionsServer(...(data.args as Parameters<typeof loadTaughtOptionsServer>)));

export async function loadTaughtOptions(...args: Parameters<typeof loadTaughtOptionsServer>): Promise<Awaited<ReturnType<typeof loadTaughtOptionsServer>>> {
  return loadTaughtOptionsFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof loadTaughtOptionsServer>>>;
}

const saveTaughtFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => saveTaughtServer(...(data.args as Parameters<typeof saveTaughtServer>)));

export async function saveTaught(...args: Parameters<typeof saveTaughtServer>): Promise<Awaited<ReturnType<typeof saveTaughtServer>>> {
  return saveTaughtFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof saveTaughtServer>>>;
}
