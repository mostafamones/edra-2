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

/** After a membership change: counts, the lists that can include or exclude these questions, and their details. */
export function invalidateMemberships(client: QueryClient, scope: BankScope, collectionId: string, questionIds: string[]) {
  void client.invalidateQueries({ queryKey: bankKeys.collections(scope) });
  void client.invalidateQueries({ queryKey: bankKeys.lists(scope), predicate: query => (query.queryKey[4] as BankFilters | undefined)?.collectionId === collectionId });
  for (const id of questionIds) void client.invalidateQueries({ queryKey: bankKeys.detail(scope, id) });
}

export const collectionLabel = (collection: Pick<BankCollection, "kind" | "name" | "firstPage">) =>
  collection.kind === "source_section" && collection.firstPage ? `${collection.name} · p. ${collection.firstPage}` : collection.name;
