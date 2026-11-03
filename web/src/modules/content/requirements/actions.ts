import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  loadRequirementOptions as loadRequirementOptionsServer,
} from "./actions.server";

const loadRequirementOptionsFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => loadRequirementOptionsServer(...(data.args as Parameters<typeof loadRequirementOptionsServer>)));

export async function loadRequirementOptions(...args: Parameters<typeof loadRequirementOptionsServer>): Promise<Awaited<ReturnType<typeof loadRequirementOptionsServer>>> {
  return loadRequirementOptionsFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof loadRequirementOptionsServer>>>;
}
