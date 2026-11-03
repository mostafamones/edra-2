import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  createGroup as createGroupServer,
  updateGroup as updateGroupServer,
  archiveGroup as archiveGroupServer,
  restoreGroup as restoreGroupServer,
} from "./actions.server";

const createGroupFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => createGroupServer(data.value as Parameters<typeof createGroupServer>[0]));

export async function createGroup(value: Parameters<typeof createGroupServer>[0]): Promise<Awaited<ReturnType<typeof createGroupServer>>> {
  return createGroupFn({ data: { value } });
}

const updateGroupFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ groupId: z.unknown(), value: z.unknown() }))
  .handler(({ data }) => updateGroupServer(data.groupId as Parameters<typeof updateGroupServer>[0], data.value as Parameters<typeof updateGroupServer>[1]));

export async function updateGroup(groupId: Parameters<typeof updateGroupServer>[0], value: Parameters<typeof updateGroupServer>[1]): Promise<Awaited<ReturnType<typeof updateGroupServer>>> {
  return updateGroupFn({ data: { groupId, value } });
}

const archiveGroupFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ academyId: z.unknown(), groupId: z.unknown() }))
  .handler(({ data }) => archiveGroupServer(data.academyId as Parameters<typeof archiveGroupServer>[0], data.groupId as Parameters<typeof archiveGroupServer>[1]));

export async function archiveGroup(academyId: Parameters<typeof archiveGroupServer>[0], groupId: Parameters<typeof archiveGroupServer>[1]): Promise<Awaited<ReturnType<typeof archiveGroupServer>>> {
  return archiveGroupFn({ data: { academyId, groupId } });
}

const restoreGroupFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ academyId: z.unknown(), groupId: z.unknown() }))
  .handler(({ data }) => restoreGroupServer(data.academyId as Parameters<typeof restoreGroupServer>[0], data.groupId as Parameters<typeof restoreGroupServer>[1]));

export async function restoreGroup(academyId: Parameters<typeof restoreGroupServer>[0], groupId: Parameters<typeof restoreGroupServer>[1]): Promise<Awaited<ReturnType<typeof restoreGroupServer>>> {
  return restoreGroupFn({ data: { academyId, groupId } });
}
