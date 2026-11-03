import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  startSession as startSessionServer,
  endSession as endSessionServer,
  archiveSession as archiveSessionServer,
  restoreSession as restoreSessionServer,
} from "./actions.server";

const startSessionFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => startSessionServer(data.value as Parameters<typeof startSessionServer>[0]));

export async function startSession(value: Parameters<typeof startSessionServer>[0]): Promise<Awaited<ReturnType<typeof startSessionServer>>> {
  return startSessionFn({ data: { value } });
}

const endSessionFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => endSessionServer(data.value as Parameters<typeof endSessionServer>[0]));

export async function endSession(value: Parameters<typeof endSessionServer>[0]): Promise<Awaited<ReturnType<typeof endSessionServer>>> {
  return endSessionFn({ data: { value } });
}

const archiveSessionFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => archiveSessionServer(data.value as Parameters<typeof archiveSessionServer>[0]));

export async function archiveSession(value: Parameters<typeof archiveSessionServer>[0]): Promise<Awaited<ReturnType<typeof archiveSessionServer>>> {
  return archiveSessionFn({ data: { value } });
}

const restoreSessionFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => restoreSessionServer(data.value as Parameters<typeof restoreSessionServer>[0]));

export async function restoreSession(value: Parameters<typeof restoreSessionServer>[0]): Promise<Awaited<ReturnType<typeof restoreSessionServer>>> {
  return restoreSessionFn({ data: { value } });
}
