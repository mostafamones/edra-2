import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  searchAcademy as searchAcademyServer,
} from "./actions.server";

const searchAcademyFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => searchAcademyServer(data.value as Parameters<typeof searchAcademyServer>[0]));

export async function searchAcademy(value: Parameters<typeof searchAcademyServer>[0]): Promise<Awaited<ReturnType<typeof searchAcademyServer>>> {
  return searchAcademyFn({ data: { value } });
}
