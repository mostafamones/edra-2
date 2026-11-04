import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  createConcern as createConcernServer,
  sendConcernMessage as sendConcernMessageServer,
  editConcernMessage as editConcernMessageServer,
  deleteConcernMessage as deleteConcernMessageServer,
  setConcernReaction as setConcernReactionServer,
  markConcernRead as markConcernReadServer,
} from "./actions.server";

const createConcernFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => createConcernServer(...(data.args as Parameters<typeof createConcernServer>)));

export async function createConcern(...args: Parameters<typeof createConcernServer>): Promise<Awaited<ReturnType<typeof createConcernServer>>> {
  return createConcernFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof createConcernServer>>>;
}

const sendConcernMessageFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => sendConcernMessageServer(...(data.args as Parameters<typeof sendConcernMessageServer>)));

export async function sendConcernMessage(...args: Parameters<typeof sendConcernMessageServer>): Promise<Awaited<ReturnType<typeof sendConcernMessageServer>>> {
  return sendConcernMessageFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof sendConcernMessageServer>>>;
}

const editConcernMessageFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => editConcernMessageServer(...(data.args as Parameters<typeof editConcernMessageServer>)));

export async function editConcernMessage(...args: Parameters<typeof editConcernMessageServer>): Promise<Awaited<ReturnType<typeof editConcernMessageServer>>> {
  return editConcernMessageFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof editConcernMessageServer>>>;
}

const deleteConcernMessageFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => deleteConcernMessageServer(...(data.args as Parameters<typeof deleteConcernMessageServer>)));

export async function deleteConcernMessage(...args: Parameters<typeof deleteConcernMessageServer>): Promise<Awaited<ReturnType<typeof deleteConcernMessageServer>>> {
  return deleteConcernMessageFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof deleteConcernMessageServer>>>;
}

const setConcernReactionFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => setConcernReactionServer(...(data.args as Parameters<typeof setConcernReactionServer>)));

export async function setConcernReaction(...args: Parameters<typeof setConcernReactionServer>): Promise<Awaited<ReturnType<typeof setConcernReactionServer>>> {
  return setConcernReactionFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof setConcernReactionServer>>>;
}

const markConcernReadFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => markConcernReadServer(...(data.args as Parameters<typeof markConcernReadServer>)));

export async function markConcernRead(...args: Parameters<typeof markConcernReadServer>): Promise<Awaited<ReturnType<typeof markConcernReadServer>>> {
  return markConcernReadFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof markConcernReadServer>>>;
}
