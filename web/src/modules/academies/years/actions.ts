import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  getYearLearning as getYearLearningServer,
  startYearLearning as startYearLearningServer,
} from "./actions.server";

const getYearLearningFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ academyId: z.unknown() }))
  .handler(({ data }) => getYearLearningServer(data.academyId as Parameters<typeof getYearLearningServer>[0]));

export async function getYearLearning(academyId: Parameters<typeof getYearLearningServer>[0]): Promise<Awaited<ReturnType<typeof getYearLearningServer>>> {
  return getYearLearningFn({ data: { academyId } });
}

const startYearLearningFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ academyId: z.unknown(), yearId: z.unknown() }))
  .handler(({ data }) => startYearLearningServer(data.academyId as Parameters<typeof startYearLearningServer>[0], data.yearId as Parameters<typeof startYearLearningServer>[1]));

export async function startYearLearning(academyId: Parameters<typeof startYearLearningServer>[0], yearId: Parameters<typeof startYearLearningServer>[1]): Promise<Awaited<ReturnType<typeof startYearLearningServer>>> {
  return startYearLearningFn({ data: { academyId, yearId } });
}
