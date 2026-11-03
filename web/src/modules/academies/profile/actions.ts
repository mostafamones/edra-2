import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  saveAcademyProfile as saveAcademyProfileServer,
  loadAcademyProfile as loadAcademyProfileServer,
} from "./actions.server";
export type { AcademyProfileResult } from "./actions.server";

const saveAcademyProfileFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ academySlug: z.unknown(), expectedUpdatedAt: z.unknown(), input: z.unknown() }))
  .handler(({ data }) => saveAcademyProfileServer(data.academySlug as Parameters<typeof saveAcademyProfileServer>[0], data.expectedUpdatedAt as Parameters<typeof saveAcademyProfileServer>[1], data.input as Parameters<typeof saveAcademyProfileServer>[2]));

export async function saveAcademyProfile(academySlug: Parameters<typeof saveAcademyProfileServer>[0], expectedUpdatedAt: Parameters<typeof saveAcademyProfileServer>[1], input: Parameters<typeof saveAcademyProfileServer>[2]): Promise<Awaited<ReturnType<typeof saveAcademyProfileServer>>> {
  return saveAcademyProfileFn({ data: { academySlug, expectedUpdatedAt, input } });
}

const loadAcademyProfileFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ academySlug: z.unknown() }))
  .handler(({ data }) => loadAcademyProfileServer(data.academySlug as Parameters<typeof loadAcademyProfileServer>[0]));

export async function loadAcademyProfile(academySlug: Parameters<typeof loadAcademyProfileServer>[0]): Promise<Awaited<ReturnType<typeof loadAcademyProfileServer>>> {
  return loadAcademyProfileFn({ data: { academySlug } });
}
