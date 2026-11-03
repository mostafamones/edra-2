import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  createLabel as createLabelServer,
  updateLabel as updateLabelServer,
  deleteLabel as deleteLabelServer,
} from "./actions.server";

const createLabelFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => createLabelServer(...(data.args as Parameters<typeof createLabelServer>)));

export async function createLabel(...args: Parameters<typeof createLabelServer>): Promise<Awaited<ReturnType<typeof createLabelServer>>> {
  return createLabelFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof createLabelServer>>>;
}

const updateLabelFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => updateLabelServer(...(data.args as Parameters<typeof updateLabelServer>)));

export async function updateLabel(...args: Parameters<typeof updateLabelServer>): Promise<Awaited<ReturnType<typeof updateLabelServer>>> {
  return updateLabelFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof updateLabelServer>>>;
}

const deleteLabelFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => deleteLabelServer(...(data.args as Parameters<typeof deleteLabelServer>)));

export async function deleteLabel(...args: Parameters<typeof deleteLabelServer>): Promise<Awaited<ReturnType<typeof deleteLabelServer>>> {
  return deleteLabelFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof deleteLabelServer>>>;
}
