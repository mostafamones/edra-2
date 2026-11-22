import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createCollection, listBank, loadBankCatalog, loadCollections, readBank, renameCollection, saveBank, setMembership } from "./bank.server";
import { bankFilters, collectionName } from "./bank-contract";

const academy = z.object({ academyId: z.guid() });
export const loadQuestionBankCatalog = createServerFn({ method: "GET" })
  .validator(academy).handler(({ data }) => loadBankCatalog(data.academyId));
export const listQuestionBank = createServerFn({ method: "GET" })
  .validator(academy.extend({ filters: bankFilters })).handler(({ data }) => listBank(data.academyId, data.filters));
export const loadQuestionBankCollections = createServerFn({ method: "GET" })
  .validator(academy).handler(({ data }) => loadCollections(data.academyId));
export const createQuestionBankCollection = createServerFn({ method: "POST" })
  .validator(academy.extend({ id: z.guid(), kind: z.enum(["topic", "custom"]), name: collectionName }))
  .handler(({ data }) => createCollection(data.academyId, data.id, data.kind, data.name));
export const renameQuestionBankCollection = createServerFn({ method: "POST" })
  .validator(academy.extend({ id: z.guid(), name: collectionName })).handler(({ data }) => renameCollection(data.academyId, data.id, data.name));
export const setQuestionBankMembership = createServerFn({ method: "POST" })
  .validator(academy.extend({ collectionId: z.guid(), questionIds: z.array(z.guid()).min(1).max(100), member: z.boolean() }))
  .handler(({ data }) => setMembership(data.academyId, data.collectionId, data.questionIds, data.member));
export const readQuestionBank = createServerFn({ method: "GET" })
  .validator(academy.extend({ id: z.guid() })).handler(({ data }) => readBank(data.academyId, data.id));
export const saveQuestionBank = createServerFn({ method: "POST", strict: false })
  .validator((data: unknown) => data).handler(({ data }) => saveBank(data));
