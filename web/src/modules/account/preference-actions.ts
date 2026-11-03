import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  saveTimeFormat as saveTimeFormatServer,
} from "./preference-actions.server";

const saveTimeFormatFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => saveTimeFormatServer(data.value as Parameters<typeof saveTimeFormatServer>[0]));

export async function saveTimeFormat(value: Parameters<typeof saveTimeFormatServer>[0]): Promise<Awaited<ReturnType<typeof saveTimeFormatServer>>> {
  return saveTimeFormatFn({ data: { value } });
}
