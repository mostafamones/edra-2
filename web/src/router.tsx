import { createRouter } from "@tanstack/react-router";
import { getQueryClient } from "@/lib/query-client";
import { routerRewrite } from "@/lib/routing/rewrite";
import { searchRecord, stringifySearch } from "@/routes/-functions/search";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    context: { queryClient: getQueryClient() },
    rewrite: routerRewrite,
    parseSearch: searchRecord,
    stringifySearch,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register { router: ReturnType<typeof getRouter> }
}
