import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  setAssessmentLabel as setAssessmentLabelServer,
} from "./labels.server";

const setAssessmentLabelFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => setAssessmentLabelServer(data.value as Parameters<typeof setAssessmentLabelServer>[0]));

export async function setAssessmentLabel(value: Parameters<typeof setAssessmentLabelServer>[0]): ReturnType<typeof setAssessmentLabelServer> {
  return setAssessmentLabelFn({ data: { value } }) as ReturnType<typeof setAssessmentLabelServer>;
}
