import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { expect, it } from "vitest";
import { routerRewrite } from "@/lib/routing/rewrite";
import { searchRecord, stringifySearch } from "@/routes/-functions/search";

it("checks the gateway-forwarded staff entry URL against Router canonicalization", () => {
  const root = createRootRoute();
  const routeTree = root.addChildren([createRoute({ getParentRoute: () => root, path: "/app" })]);
  // Gateway forwards /app/x?q=1e3 as /?q=1e3 and keeps the original in its trusted header.
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/?q=1e3"] }), origin: "http://app.lvh.me:3000", rewrite: routerRewrite });
  const next = router.parseLocation(router.history.location);
  const canonical = router.buildLocation({ to: next.pathname, search: true, params: true, hash: true, state: true, _includeValidateSearch: true });
  expect(next.pathname).toBe("/app");
  expect(next.publicHref).toBe("/?q=1e3");
  expect(canonical.publicHref).toBe("/?q=1000");

  const rawRouter = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/?q=1e3"] }), origin: "http://app.lvh.me:3000", rewrite: routerRewrite, parseSearch: searchRecord, stringifySearch });
  const raw = rawRouter.parseLocation(rawRouter.history.location);
  expect(rawRouter.buildLocation({ to: raw.pathname, search: true, params: true, hash: true, state: true, _includeValidateSearch: true }).publicHref).toBe(raw.publicHref);

  const encodedRouter = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/?q=a%20b"] }), origin: "http://app.lvh.me:3000", rewrite: routerRewrite, parseSearch: searchRecord, stringifySearch });
  const encoded = encodedRouter.parseLocation(encodedRouter.history.location);
  expect(encodedRouter.buildLocation({ to: encoded.pathname, search: true, params: true, hash: true, state: true, _includeValidateSearch: true }).publicHref).toBe("/?q=a+b");
  expect(encoded.publicHref).toBe("/?q=a%20b");
});
