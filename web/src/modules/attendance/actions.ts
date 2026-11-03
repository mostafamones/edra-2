import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  recordCheckIn as recordCheckInServer,
  saveAttendanceChanges as saveAttendanceChangesServer,
  publishReviewedAttendance as publishReviewedAttendanceServer,
  markRemainingAbsent as markRemainingAbsentServer,
  findAttendees as findAttendeesServer,
  addSessionAttendee as addSessionAttendeeServer,
} from "./actions.server";

const recordCheckInFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => recordCheckInServer(data.value as Parameters<typeof recordCheckInServer>[0]));

export async function recordCheckIn(value: Parameters<typeof recordCheckInServer>[0]): Promise<Awaited<ReturnType<typeof recordCheckInServer>>> {
  return recordCheckInFn({ data: { value } });
}

const saveAttendanceChangesFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => saveAttendanceChangesServer(data.value as Parameters<typeof saveAttendanceChangesServer>[0]));

export async function saveAttendanceChanges(value: Parameters<typeof saveAttendanceChangesServer>[0]): Promise<Awaited<ReturnType<typeof saveAttendanceChangesServer>>> {
  return saveAttendanceChangesFn({ data: { value } });
}

const publishReviewedAttendanceFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => publishReviewedAttendanceServer(data.value as Parameters<typeof publishReviewedAttendanceServer>[0]));

export async function publishReviewedAttendance(value: Parameters<typeof publishReviewedAttendanceServer>[0]): Promise<Awaited<ReturnType<typeof publishReviewedAttendanceServer>>> {
  return publishReviewedAttendanceFn({ data: { value } });
}

const markRemainingAbsentFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => markRemainingAbsentServer(data.value as Parameters<typeof markRemainingAbsentServer>[0]));

export async function markRemainingAbsent(value: Parameters<typeof markRemainingAbsentServer>[0]): Promise<Awaited<ReturnType<typeof markRemainingAbsentServer>>> {
  return markRemainingAbsentFn({ data: { value } });
}

const findAttendeesFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => findAttendeesServer(data.value as Parameters<typeof findAttendeesServer>[0]));

export async function findAttendees(value: Parameters<typeof findAttendeesServer>[0]): Promise<Awaited<ReturnType<typeof findAttendeesServer>>> {
  return findAttendeesFn({ data: { value } });
}

const addSessionAttendeeFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => addSessionAttendeeServer(data.value as Parameters<typeof addSessionAttendeeServer>[0]));

export async function addSessionAttendee(value: Parameters<typeof addSessionAttendeeServer>[0]): Promise<Awaited<ReturnType<typeof addSessionAttendeeServer>>> {
  return addSessionAttendeeFn({ data: { value } });
}
