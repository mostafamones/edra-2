import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { listBank, loadBankCatalog, readBank, saveBank } from "./bank.server";

const academy = z.object({ academyId: z.guid() });
export const loadQuestionBankCatalog = createServerFn({ method: "GET" })
  .validator(academy).handler(({ data }) => loadBankCatalog(data.academyId));
export const listQuestionBank = createServerFn({ method: "GET" })
  .validator(academy.extend({ offset: z.number().int().min(0).max(100_000) })).handler(({ data }) => listBank(data.academyId, data.offset));
export const readQuestionBank = createServerFn({ method: "GET" })
  .validator(academy.extend({ id: z.guid() })).handler(({ data }) => readBank(data.academyId, data.id));
export const saveQuestionBank = createServerFn({ method: "POST", strict: false })
  .validator((data: unknown) => data).handler(({ data }) => saveBank(data));
