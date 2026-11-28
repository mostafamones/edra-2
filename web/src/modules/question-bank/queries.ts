import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { listQuestionBank, loadQuestionBankCollections, readQuestionBank } from "./bank";
import type { BankCollection, BankFilters, BankResult } from "./bank-contract";

export type BankScope = { academyId: string; academySlug: string; accountId: string };

// Every key starts with account and academy, so another identity never reads or receives these entries.
export const bankKeys = {
  root: (scope: BankScope) => ["question-bank", scope.accountId, scope.academyId] as const,
  collections: (scope: BankScope) => [...bankKeys.root(scope), "collections"] as const,
  lists: (scope: BankScope) => [...bankKeys.root(scope), "list"] as const,
  list: (scope: BankScope, filters: BankFilters) => [...bankKeys.lists(scope), filters] as const,
  details: (scope: BankScope) => [...bankKeys.root(scope), "detail"] as const,
  detail: (scope: BankScope, id: string) => [...bankKeys.details(scope), id] as const,
};

const unwrap = <T>(result: BankResult<T>) => {
  if (!result.ok) throw new Error(result.message);
  return result.data;
};

export const collectionsOptions = (scope: BankScope) => queryOptions({
  queryKey: bankKeys.collections(scope),
  queryFn: async ({ signal }) => unwrap(await loadQuestionBankCollections({ data: { academyId: scope.academyId }, signal })),
  retry: false,
});

export const bankPageOptions = (scope: BankScope, filters: BankFilters) => queryOptions({
  queryKey: bankKeys.list(scope, filters),
  queryFn: async ({ signal }) => unwrap(await listQuestionBank({ data: { academyId: scope.academyId, filters }, signal })),
  retry: false,
});

export const bankDetailOptions = (scope: BankScope, id: string) => queryOptions({
  queryKey: bankKeys.detail(scope, id),
  queryFn: async ({ signal }) => unwrap(await readQuestionBank({ data: { academyId: scope.academyId, id }, signal })),
  retry: false,
});

/** After a membership, edit, archive or delete: counts, every list (rows show memberships and answer state) and the touched details. */
export function invalidateQuestions(client: QueryClient, scope: BankScope, questionIds: string[]) {
  void client.invalidateQueries({ queryKey: bankKeys.collections(scope) });
  void client.invalidateQueries({ queryKey: bankKeys.lists(scope) });
  for (const id of questionIds) void client.invalidateQueries({ queryKey: bankKeys.detail(scope, id) });
}

export const collectionLabel = (collection: Pick<BankCollection, "kind" | "name" | "firstPage">) =>
  collection.kind === "source_section" && collection.firstPage ? `${collection.name} · Page ${collection.firstPage}` : collection.name;

/** A source filename without its extension. */
export const fileTitle = (file: string) => file.replace(/\.[a-z0-9]{1,5}$/i, "");

/** A printed number such as "12" or "3b"; printed labels like "First Question" or "Unnumbered" are not numbers. */
export const questionNumber = (printed: string | null | undefined) => printed && /^\d{1,4}[a-z]?$/i.test(printed.trim()) ? printed.trim() : null;

export function questionTitle(printed: string | null | undefined) {
  const number = questionNumber(printed);
  if (number) return `Question ${number}`;
  return printed?.trim() && !/^unnumbered$/i.test(printed.trim()) ? printed.trim() : "Question";
}
