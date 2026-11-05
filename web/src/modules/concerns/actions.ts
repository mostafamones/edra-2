import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  createConcern as createConcernServer,
  sendConcernMessage as sendConcernMessageServer,
  editConcernMessage as editConcernMessageServer,
  deleteConcernMessage as deleteConcernMessageServer,
  setConcernReaction as setConcernReactionServer,
  markConcernRead as markConcernReadServer,
  addConcernParticipants as addConcernParticipantsServer,
  removeConcernParticipant as removeConcernParticipantServer,
  settleConcern as settleConcernServer,
  reopenConcern as reopenConcernServer,
  recoverConcern as recoverConcernServer,
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

const addConcernParticipantsFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => addConcernParticipantsServer(...(data.args as Parameters<typeof addConcernParticipantsServer>)));

export async function addConcernParticipants(...args: Parameters<typeof addConcernParticipantsServer>): Promise<Awaited<ReturnType<typeof addConcernParticipantsServer>>> {
  return addConcernParticipantsFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof addConcernParticipantsServer>>>;
}

const removeConcernParticipantFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => removeConcernParticipantServer(...(data.args as Parameters<typeof removeConcernParticipantServer>)));

export async function removeConcernParticipant(...args: Parameters<typeof removeConcernParticipantServer>): Promise<Awaited<ReturnType<typeof removeConcernParticipantServer>>> {
  return removeConcernParticipantFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof removeConcernParticipantServer>>>;
}

const settleConcernFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => settleConcernServer(...(data.args as Parameters<typeof settleConcernServer>)));

export async function settleConcern(...args: Parameters<typeof settleConcernServer>): Promise<Awaited<ReturnType<typeof settleConcernServer>>> {
  return settleConcernFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof settleConcernServer>>>;
}

const reopenConcernFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => reopenConcernServer(...(data.args as Parameters<typeof reopenConcernServer>)));

export async function reopenConcern(...args: Parameters<typeof reopenConcernServer>): Promise<Awaited<ReturnType<typeof reopenConcernServer>>> {
  return reopenConcernFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof reopenConcernServer>>>;
}

const recoverConcernFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => recoverConcernServer(...(data.args as Parameters<typeof recoverConcernServer>)));

export async function recoverConcern(...args: Parameters<typeof recoverConcernServer>): Promise<Awaited<ReturnType<typeof recoverConcernServer>>> {
  return recoverConcernFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof recoverConcernServer>>>;
}
