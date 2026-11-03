import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  submitStudentBooking as submitStudentBookingServer,
  getStudentBookingSettings as getStudentBookingSettingsServer,
  saveStudentBookingSettings as saveStudentBookingSettingsServer,
  listStudentBookingRegistrations as listStudentBookingRegistrationsServer,
} from "./actions.server";

const submitStudentBookingFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown()]) }))
  .handler(({ data }) => submitStudentBookingServer(...(data.args as Parameters<typeof submitStudentBookingServer>)));

export async function submitStudentBooking(...args: Parameters<typeof submitStudentBookingServer>): Promise<Awaited<ReturnType<typeof submitStudentBookingServer>>> {
  return submitStudentBookingFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof submitStudentBookingServer>>>;
}

const getStudentBookingSettingsFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => getStudentBookingSettingsServer(...(data.args as Parameters<typeof getStudentBookingSettingsServer>)));

export async function getStudentBookingSettings(...args: Parameters<typeof getStudentBookingSettingsServer>): Promise<Awaited<ReturnType<typeof getStudentBookingSettingsServer>>> {
  return getStudentBookingSettingsFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof getStudentBookingSettingsServer>>>;
}

const saveStudentBookingSettingsFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown()]) }))
  .handler(({ data }) => saveStudentBookingSettingsServer(...(data.args as Parameters<typeof saveStudentBookingSettingsServer>)));

export async function saveStudentBookingSettings(...args: Parameters<typeof saveStudentBookingSettingsServer>): Promise<Awaited<ReturnType<typeof saveStudentBookingSettingsServer>>> {
  return saveStudentBookingSettingsFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof saveStudentBookingSettingsServer>>>;
}

const listStudentBookingRegistrationsFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.number()]) }))
  .handler(({ data }) => listStudentBookingRegistrationsServer(...(data.args as Parameters<typeof listStudentBookingRegistrationsServer>)));

export async function listStudentBookingRegistrations(...args: Parameters<typeof listStudentBookingRegistrationsServer>): Promise<Awaited<ReturnType<typeof listStudentBookingRegistrationsServer>>> {
  return listStudentBookingRegistrationsFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof listStudentBookingRegistrationsServer>>>;
}
