import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  previewStudentInvite as previewStudentInviteServer,
  completeStudentInvite as completeStudentInviteServer,
  openStudentInviteLink as openStudentInviteLinkServer,
  clearStudentInvite as clearStudentInviteServer,
  getStudentEnrollmentSettings as getStudentEnrollmentSettingsServer,
  updateStudentEnrollmentSettings as updateStudentEnrollmentSettingsServer,
  setStudentInvite as setStudentInviteServer,
} from "./actions.server";

const previewStudentInviteFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([]) }))
  .handler(({ data }) => previewStudentInviteServer(...(data.args as Parameters<typeof previewStudentInviteServer>)));

export async function previewStudentInvite(...args: Parameters<typeof previewStudentInviteServer>): Promise<Awaited<ReturnType<typeof previewStudentInviteServer>>> {
  return previewStudentInviteFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof previewStudentInviteServer>>>;
}

const completeStudentInviteFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => completeStudentInviteServer(...(data.args as Parameters<typeof completeStudentInviteServer>)));

export async function completeStudentInvite(...args: Parameters<typeof completeStudentInviteServer>): Promise<Awaited<ReturnType<typeof completeStudentInviteServer>>> {
  return completeStudentInviteFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof completeStudentInviteServer>>>;
}

const openStudentInviteLinkFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => openStudentInviteLinkServer(...(data.args as Parameters<typeof openStudentInviteLinkServer>)));

export async function openStudentInviteLink(...args: Parameters<typeof openStudentInviteLinkServer>): Promise<Awaited<ReturnType<typeof openStudentInviteLinkServer>>> {
  return openStudentInviteLinkFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof openStudentInviteLinkServer>>>;
}

const clearStudentInviteFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([]) }))
  .handler(({ data }) => clearStudentInviteServer(...(data.args as Parameters<typeof clearStudentInviteServer>)));

export async function clearStudentInvite(...args: Parameters<typeof clearStudentInviteServer>): Promise<Awaited<ReturnType<typeof clearStudentInviteServer>>> {
  return clearStudentInviteFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof clearStudentInviteServer>>>;
}

const getStudentEnrollmentSettingsFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => getStudentEnrollmentSettingsServer(...(data.args as Parameters<typeof getStudentEnrollmentSettingsServer>)));

export async function getStudentEnrollmentSettings(...args: Parameters<typeof getStudentEnrollmentSettingsServer>): Promise<Awaited<ReturnType<typeof getStudentEnrollmentSettingsServer>>> {
  return getStudentEnrollmentSettingsFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof getStudentEnrollmentSettingsServer>>>;
}

const updateStudentEnrollmentSettingsFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown()]) }))
  .handler(({ data }) => updateStudentEnrollmentSettingsServer(...(data.args as Parameters<typeof updateStudentEnrollmentSettingsServer>)));

export async function updateStudentEnrollmentSettings(...args: Parameters<typeof updateStudentEnrollmentSettingsServer>): Promise<Awaited<ReturnType<typeof updateStudentEnrollmentSettingsServer>>> {
  return updateStudentEnrollmentSettingsFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof updateStudentEnrollmentSettingsServer>>>;
}

const setStudentInviteFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown()]) }))
  .handler(({ data }) => setStudentInviteServer(...(data.args as Parameters<typeof setStudentInviteServer>)));

export async function setStudentInvite(...args: Parameters<typeof setStudentInviteServer>): Promise<Awaited<ReturnType<typeof setStudentInviteServer>>> {
  return setStudentInviteFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof setStudentInviteServer>>>;
}
