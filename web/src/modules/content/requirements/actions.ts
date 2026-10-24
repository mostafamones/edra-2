"use server";

import { z } from "zod";
import { contentCaller, contentResult } from "../data";
import { learningError } from "../access/types";

const optionsSchema = z.object({ types: z.array(z.object({ id: z.guid(), name: z.string() })), units: z.array(z.object({
  id: z.guid(), title: z.string(), assessments: z.array(z.object({ id: z.guid(), kind: z.enum(["assignment", "quiz"]), title: z.string() })).nullable(),
})) });

export async function loadRequirementOptions(value: unknown) {
  return contentResult(async () => {
    const input = z.object({ academyId: z.guid(), unitId: z.guid() }).parse(value);
    const { db, userId } = await contentCaller(input.academyId);
    const { data, error } = await db.rpc("get_content_requirement_options", { p_academy_id: input.academyId, p_unit_id: input.unitId });
    learningError(error);
    return { ...optionsSchema.parse(data), userId };
  });
}
