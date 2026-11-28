import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  discardConcernUpload as discardServer, finishConcernUpload as finishServer, startConcernUpload as startServer,
} from "./media.server";

const startFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => startServer(...(data.args as Parameters<typeof startServer>)));
export async function startConcernUpload(...args: Parameters<typeof startServer>): Promise<Awaited<ReturnType<typeof startServer>>> {
  return startFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof startServer>>>;
}

const finishFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => finishServer(...(data.args as Parameters<typeof finishServer>)));
export async function finishConcernUpload(...args: Parameters<typeof finishServer>): Promise<Awaited<ReturnType<typeof finishServer>>> {
  return finishFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof finishServer>>>;
}

const discardFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => discardServer(...(data.args as Parameters<typeof discardServer>)));
export async function discardConcernUpload(...args: Parameters<typeof discardServer>): Promise<Awaited<ReturnType<typeof discardServer>>> {
  return discardFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof discardServer>>>;
}
