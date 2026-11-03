import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  checkAcademySlugAvailability as checkAcademySlugAvailabilityServer,
  createAcademySetup as createAcademySetupServer,
} from "./actions.server";
export type { AcademySetupResult } from "./actions.server";

const checkAcademySlugAvailabilityFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => checkAcademySlugAvailabilityServer(data.value as Parameters<typeof checkAcademySlugAvailabilityServer>[0]));

export async function checkAcademySlugAvailability(value: Parameters<typeof checkAcademySlugAvailabilityServer>[0]): Promise<Awaited<ReturnType<typeof checkAcademySlugAvailabilityServer>>> {
  return checkAcademySlugAvailabilityFn({ data: { value } });
}

const createAcademySetupFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => createAcademySetupServer(data.value as Parameters<typeof createAcademySetupServer>[0]));

export async function createAcademySetup(value: Parameters<typeof createAcademySetupServer>[0]): Promise<Awaited<ReturnType<typeof createAcademySetupServer>>> {
  return createAcademySetupFn({ data: { value } });
}
