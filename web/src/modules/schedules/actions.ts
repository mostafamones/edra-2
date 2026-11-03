import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  createSchedule as createScheduleServer,
  updateSchedule as updateScheduleServer,
  archiveSchedule as archiveScheduleServer,
} from "./actions.server";

const createScheduleFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => createScheduleServer(data.value as Parameters<typeof createScheduleServer>[0]));

export async function createSchedule(value: Parameters<typeof createScheduleServer>[0]): Promise<Awaited<ReturnType<typeof createScheduleServer>>> {
  return createScheduleFn({ data: { value } });
}

const updateScheduleFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ scheduleId: z.unknown(), value: z.unknown() }))
  .handler(({ data }) => updateScheduleServer(data.scheduleId as Parameters<typeof updateScheduleServer>[0], data.value as Parameters<typeof updateScheduleServer>[1]));

export async function updateSchedule(scheduleId: Parameters<typeof updateScheduleServer>[0], value: Parameters<typeof updateScheduleServer>[1]): Promise<Awaited<ReturnType<typeof updateScheduleServer>>> {
  return updateScheduleFn({ data: { scheduleId, value } });
}

const archiveScheduleFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ academyId: z.unknown(), scheduleId: z.unknown() }))
  .handler(({ data }) => archiveScheduleServer(data.academyId as Parameters<typeof archiveScheduleServer>[0], data.scheduleId as Parameters<typeof archiveScheduleServer>[1]));

export async function archiveSchedule(academyId: Parameters<typeof archiveScheduleServer>[0], scheduleId: Parameters<typeof archiveScheduleServer>[1]): Promise<Awaited<ReturnType<typeof archiveScheduleServer>>> {
  return archiveScheduleFn({ data: { academyId, scheduleId } });
}
