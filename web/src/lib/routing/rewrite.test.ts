import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

vi.mock("@/lib/env/public", () => ({ publicEnv: {
  marketingOrigin: "https://lvh.me:3000", appOrigin: "https://app.lvh.me:3000", learnOrigin: "https://learn.lvh.me:3000",
} }));
import { routerRewrite } from "./rewrite";
import { validDevelopmentTunnelHost } from "./development";
import { requiresDocumentNavigation } from "../document-navigation";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  for (const key of ["EDRA_APP_ORIGIN", "EDRA_MARKETING_ORIGIN", "EDRA_LEARN_ORIGIN", "EDRA_DEV_TUNNEL_HOST"]) vi.stubEnv(key, "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function browser(origin: string, platform: string | null) {
  vi.stubGlobal("window", { location: { origin } });
  vi.stubGlobal("document", { querySelector: () => platform ? { getAttribute: () => platform } : null });
}

it("keeps the server-rendered staff namespace when navigating on a development tunnel", () => {
  browser("https://phone.example", "staff");
  const url = new URL("https://phone.example/academy/manage/students?q=a%20b&q=2");
  const internal = routerRewrite.input({ url });
  expect(internal.pathname).toBe("/app/academy/manage/students");
  expect(routerRewrite.output({ url: internal }).href).toBe(url.href);
  expect(routerRewrite.input({ url: new URL("https://phone.example/api/mobile/v1/me") }).pathname).toBe("/api/mobile/v1/me");
});

it("does not infer aliases on the server or use a presentation hint across origins", () => {
  const url = new URL("https://phone.example/academy");
  expect(routerRewrite.input({ url }).pathname).toBe("/academy");
  browser("https://phone.example", "staff");
  expect(routerRewrite.input({ url: new URL("https://other.example/academy") }).pathname).toBe("/academy");
});

it("lets canonical staff and student hosts override the presentation hint", () => {
  browser("http://learn.lvh.me:3000", "staff");
  expect(routerRewrite.input({ url: new URL("http://learn.lvh.me:3000/academy/courses") }).pathname).toBe("/learn/academy/academy/courses");
});

it("ignores development hints and tunnel configuration in production", () => {
  vi.stubEnv("NODE_ENV", "production");
  browser("https://phone.example", "staff");
  vi.stubEnv("EDRA_DEV_TUNNEL_HOST", "phone.example");
  expect(routerRewrite.input({ url: new URL("https://phone.example/academy") }).pathname).toBe("/academy");
});

it("accepts only an exact host for Vite and the server gateway", () => {
  expect(validDevelopmentTunnelHost("Phone.Example:3000")).toBe("phone.example:3000");
  for (const value of [undefined, "", "https://phone.example", "*.example", "phone.example/path", "user@phone.example", "phone.example\n"]) expect(validDevelopmentTunnelHost(value)).toBeNull();
});

it("keeps the existing assets academy slug distinct from framework assets", () => {
  const academy = new URL("https://app.lvh.me:3000/assets/students");
  expect(routerRewrite.input({ url: academy }).pathname).toBe("/app/assets/students");
  const bundle = new URL("https://app.lvh.me:3000/_build/assets/entry.js");
  expect(routerRewrite.input({ url: bundle }).href).toBe(bundle.href);
});

// Expected tokens independently checked against the original installed Next route matcher.
it.each([
  ["a%2Fb", "a/b"], ["a%252Fb", "a%2Fb"], ["a%25b", "a%b"], ["a%20b", "a b"],
  ["%D9%85%D8%B1%D8%AD%D8%A8%D8%A7", "مرحبا"],
])("decodes %s once, as the original router did", async (encoded, expected) => {
  for (const isServer of [true, false]) {
    const root = createRootRoute();
    const page = createRoute({ getParentRoute: () => root, path: "/invite/booking/$token", loader: ({ params }) => params.token });
    const router = createRouter({ routeTree: root.addChildren([page]), isServer, origin: "https://learn.lvh.me:3000", history: createMemoryHistory({ initialEntries: [`/invite/booking/${encoded}`] }) });
    await router.load();
    expect(router.state.matches.at(-1)?.loaderData).toBe(expected);
  }
});

// Raw Router behavior: the gateway absorbs escape casing before this SSR check.
it.each([
  ["a%2Fb", null], ["a%252Fb", null], ["a%25b", null], ["a%20b", null], ["%D9%85", null],
  ["%d9%85", "/academy/%D9%85"],
])("canonicalizes %s on the rewritten staff SSR path without a loop", async (segment, redirected) => {
  const root = createRootRoute();
  const page = createRoute({ getParentRoute: () => root, path: "/app/$academySlug/$id" });
  const load = async (path: string) => {
    const router = createRouter({ routeTree: root.addChildren([page]), isServer: true, origin: "https://app.lvh.me:3000", rewrite: routerRewrite, history: createMemoryHistory({ initialEntries: [path] }) });
    await router.load();
    const result = (router as unknown as { _serverResult: { type: string; redirect?: { options: { href: string } } } })._serverResult;
    expect(result.type).toBe(result.redirect ? "redirect" : "render");
    return result.redirect?.options.href ?? null;
  };
  const location = await load(`/academy/${segment}?q=1`);
  expect(location && new URL(location, "https://app.lvh.me:3000").pathname).toBe(redirected);
  if (redirected) expect(await load(`${redirected}?q=1`)).toBeNull();
});

it("preserves initial legacy paths and sends later legacy navigation through the gateway", async () => {
  const root = createRootRoute();
  const page = createRoute({ getParentRoute: () => root, path: "/app", loader: ({ location }) => location.publicHref });
  const router = createRouter({ routeTree: root.addChildren([page]), isServer: false, origin: "https://app.lvh.me:3000", rewrite: routerRewrite,
    history: createMemoryHistory({ initialEntries: ["/app/x?q=1"] }) });
  await router.load();
  expect(router.state.matches.at(-1)?.loaderData).toBe("/app/x?q=1");
  expect(requiresDocumentNavigation("/app/y?q=2", "https://app.lvh.me:3000/")).toBe(true);
  expect(requiresDocumentNavigation("/learn/courses?q=2", "https://learn.lvh.me:3000/")).toBe(true);
  expect(requiresDocumentNavigation("/academy/students", "https://app.lvh.me:3000/")).toBe(false);
});
