// @vitest-environment jsdom
import { createMemoryHistory, createRootRoute, createRoute, createRouter, notFound, redirect } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";

const gated = vi.fn();
function guardTree(parentResult: () => unknown) {
  const root = createRootRoute();
  const parent = createRoute({ getParentRoute: () => root, path: "/learn", loader: parentResult });
  const child = createRoute({ getParentRoute: () => parent, path: "$", loader: async ({ parentMatchPromise }) => {
    if ((await parentMatchPromise).status !== "success") return;
    gated();
    throw notFound();
  } });
  const list = createRoute({ getParentRoute: () => parent, path: "list", loader: async ({ parentMatchPromise }) => {
    if ((await parentMatchPromise).status !== "success") return;
    gated();
    throw redirect({ href: "/learn/shared" });
  } });
  const shared = createRoute({ getParentRoute: () => parent, path: "shared" });
  const login = createRoute({ getParentRoute: () => root, path: "/login" });
  return root.addChildren([parent.addChildren([child, list, shared]), login]);
}

describe("parent-gated child loaders under real Router scheduling", () => {
  it.each(["/learn/unknown", "/learn/list"])("the parent's redirect wins and the child does nothing on %s", async (href) => {
    gated.mockClear();
    const router = createRouter({ routeTree: guardTree(() => { throw redirect({ href: "/login" }); }), history: createMemoryHistory({ initialEntries: [href] }), isServer: false });
    await router.load();
    expect(router.state.location.pathname).toBe("/login");
    expect(gated).not.toHaveBeenCalled();
  });
  it.each(["/learn/unknown", "/learn/list"])("the SSR lane reports the parent's redirect on %s", async (href) => {
    gated.mockClear();
    const router = createRouter({ routeTree: guardTree(() => { throw redirect({ href: "/login" }); }), history: createMemoryHistory({ initialEntries: [href] }), isServer: true });
    await router.load();
    expect(router._serverResult).toMatchObject({ type: "redirect" });
    expect((router._serverResult as { redirect: Response }).redirect.headers.get("Location")).toBe("/login");
    expect(gated).not.toHaveBeenCalled();
  });
  it("SSR runs a not-found child only after the parent succeeds", async () => {
    gated.mockClear();
    const router = createRouter({ routeTree: guardTree(() => ({ ok: true })), history: createMemoryHistory({ initialEntries: ["/learn/unknown"] }), isServer: true });
    await router.load();
    expect(gated).toHaveBeenCalledOnce();
    expect(router._serverResult).toMatchObject({ type: "render", status: 404 });
  });
  it("runs the child once the parent succeeds", async () => {
    gated.mockClear();
    const router = createRouter({ routeTree: guardTree(() => ({ ok: true })), history: createMemoryHistory({ initialEntries: ["/learn/list"] }), isServer: false });
    await router.load();
    expect(gated).toHaveBeenCalledOnce();
    expect(router.state.location.pathname).toBe("/learn/shared");
  });
});

describe("private loader data across an identity change", () => {
  function accountRouter() {
    const state = { account: "A", loads: [] as ((value: string) => void)[], deferred: false };
    const root = createRootRoute();
    const page = createRoute({ getParentRoute: () => root, path: "/page", loader: () => state.deferred ? new Promise<string>(resolve => state.loads.push(resolve)) : state.account });
    const other = createRoute({ getParentRoute: () => root, path: "/other" });
    const router = createRouter({ routeTree: root.addChildren([page, other]), history: createMemoryHistory({ initialEntries: ["/page"] }), isServer: false });
    return { router, state };
  }
  const loaderData = (router: ReturnType<typeof accountRouter>["router"]) => (router.state.matches as { routeId: string; loaderData?: unknown }[]).find(match => match.routeId === "/page")?.loaderData;
  async function visit(router: ReturnType<typeof accountRouter>["router"], to: "/page" | "/other") {
    router.history.push(to);
    await router.load();
  }

  it("invalidate alone keeps the old account's cached data, clearCache removes it", async () => {
    const { router, state } = accountRouter();
    await router.load();
    await visit(router, "/other");
    state.account = "B"; state.deferred = true;
    void router.invalidate();

    const stale = [...router._cache.values()].find(match => match.routeId === "/page");
    expect(stale?.loaderData).toBe("A");
    router.clearCache();
    expect(router._cache.size).toBe(0);

    router.history.push("/page");
    const load = router.load();
    await vi.waitFor(() => expect(state.loads).toHaveLength(1));
    expect(loaderData(router)).not.toBe("A");
    state.loads[0]("B");
    await load;
    expect(loaderData(router)).toBe("B");
  });

  it("a superseded late response for the old account is not committed", async () => {
    const { router, state } = accountRouter();
    state.deferred = true;
    const first = router.load();
    await vi.waitFor(() => expect(state.loads).toHaveLength(1));
    router.clearCache();
    const refresh = router.invalidate();
    await vi.waitFor(() => expect(state.loads).toHaveLength(2));
    state.loads[1]("B");
    await refresh;
    state.loads[0]("A");
    await first;
    await new Promise(resolve => setTimeout(resolve));
    expect(loaderData(router)).toBe("B");
  });
});
