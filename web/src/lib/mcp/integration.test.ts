import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Authority } from "@/lib/supabase/authority";
import { McpGrantStore, type Grant } from "./grants";
import { scope } from "./oauth.server";
import { handleMcp } from "./handler.server";

const { mocks, origin, clientId, redirectUri } = vi.hoisted(() => ({
  mocks: { academies: vi.fn(), bearer: vi.fn(), namespace: { EDRA_MCP_GRANTS: undefined as unknown } },
  origin: "https://app.edra.example",
  clientId: "https://chatgpt.com/oauth/client.json",
  redirectUri: "https://chatgpt.com/connector_platform_oauth_redirect",
}));
vi.mock("cloudflare:workers", () => ({ env: mocks.namespace }));
vi.mock("@/lib/routing", () => ({ platformOrigin: () => origin }));
vi.mock("@/modules/academies/server", () => ({ listStaffAcademies: mocks.academies }));
vi.mock("@/lib/supabase/authority", () => ({ bearerAuthority: mocks.bearer, cookieAuthority: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { getSession: () => ({ data: { session: {
  access_token: "test-supabase-session", expires_at: (Date.now() + 180000) / 1000,
} } }) } }) }));

const resource = origin + "/api/mcp";
const academy = { id: "d0d840bc-a742-4fe9-8ca8-991ea5794e13", name: "Algebra Academy", slug: "algebra", role: "instructor" };
const otherAcademy = { ...academy, id: "31dca226-1ef9-444e-b25d-46ba839b776c" };
const unitId = "05bdfe0a-9084-48a5-8027-ffca7b4d5059";
const otherId = "f63b1f5c-58f1-4edb-91ba-cb5cf2a1a0e4";

function namespace() {
  const entries = new Map<string, McpGrantStore>();
  const grants = new Map<string, Grant>();
  return { grants, idFromName: (name: string) => name, get(name: string) {
    if (!entries.has(name)) {
      let queue = Promise.resolve<unknown>(null);
      const store = {
        get: async <T,>() => grants.get(name) as T | undefined,
        put: async (_: string, grant: Grant) => { grants.set(name, grant); },
        delete: async () => grants.delete(name), setAlarm: async () => {},
      };
      entries.set(name, new McpGrantStore({ storage: { ...store, transaction: callback => {
        const next = queue.then(() => callback(store)); queue = next.catch(() => null); return next;
      } } }));
    }
    return entries.get(name)!;
  } };
}

const verifier = "V".repeat(43);
async function challenge() {
  return Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
}
function post(path: string, data: Record<string, string>, originHeader?: string) {
  return handleMcp(new Request(resource + path, { method: "POST", body: new URLSearchParams(data), headers: originHeader ? { Origin: originHeader } : {} }));
}
async function consent(override: Record<string, string> = {}, source = origin) {
  return post("/authorize", {
    client_id: clientId, redirect_uri: redirectUri, resource, scope, response_type: "code", code_challenge_method: "S256",
    code_challenge: await challenge(), state: "oauth-state", academy_id: academy.id, decision: "allow", ...override,
  }, source);
}
async function issueCode() {
  const response = await consent();
  expect(response.status).toBe(303);
  const url = new URL(response.headers.get("location")!);
  expect(url.searchParams.get("state")).toBe("oauth-state");
  return url.searchParams.get("code")!;
}
function exchange(code: string, override: Record<string, string> = {}) {
  return post("/token", { client_id: clientId, redirect_uri: redirectUri, resource, code, code_verifier: verifier, grant_type: "authorization_code", ...override });
}

beforeEach(() => {
  vi.stubEnv("EDRA_MCP_CLIENT_ID", clientId);
  vi.stubEnv("EDRA_MCP_REDIRECT_URI", redirectUri);
  vi.stubEnv("EDRA_MCP_GRANT_KEY", "ab".repeat(32));
  mocks.namespace.EDRA_MCP_GRANTS = namespace();
  mocks.academies.mockResolvedValue([academy]);
  mocks.bearer.mockResolvedValue({ userId: "staff" });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ client_id: clientId, redirect_uris: [redirectUri], token_endpoint_auth_methods_supported: ["none", "private_key_jwt"] })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

it("challenges unauthenticated clients, publishes discovery, and refuses foreign consent origins and audiences", async () => {
  const response = await handleMcp(new Request(resource, { method: "POST" }));
  expect(response.status).toBe(401);
  expect(response.headers.get("www-authenticate")).toContain(`${origin}/.well-known/oauth-protected-resource/api/mcp`);
  const metadata = await handleMcp(new Request(`${origin}/.well-known/oauth-protected-resource/api/mcp`));
  expect(await metadata.json()).toMatchObject({ resource, authorization_servers: [origin], scopes_supported: [scope] });
  expect((await consent({}, "https://foreign.example")).status).toBe(403);
  expect((await consent({ resource: "https://foreign.example/mcp" })).status).toBe(400);
  expect((await consent({ redirect_uri: "https://foreign.example" })).status).toBe(400);
  const denied = await consent({ academy_id: otherAcademy.id });
  expect(denied.headers.get("location")).toContain("error=access_denied");
  expect((mocks.namespace.EDRA_MCP_GRANTS as ReturnType<typeof namespace>).grants.size).toBe(0);
});

it("checks PKCE, spends a code once under a race, and stores neither raw credential nor Supabase bearer", async () => {
  const code = await issueCode();
  expect((await exchange(code, { code_verifier: "X".repeat(43) })).status).toBe(400);
  expect((await exchange(code, { resource: origin })).status).toBe(400);
  const results = await Promise.all([exchange(code), exchange(code)]);
  expect(results.map(result => result.status).sort()).toEqual([200, 400]);
  const { access_token: token } = await results.find(result => result.ok)!.json();
  expect(token).not.toBe(code);
  const stored = JSON.stringify([...(mocks.namespace.EDRA_MCP_GRANTS as ReturnType<typeof namespace>).grants]);
  expect(stored).not.toContain("test-supabase-session");
  expect(stored).not.toContain(token.split(".")[1]);
});

it("round-trips the SDK through Edra OAuth and guards a versioned write, other academies, and revocation", async () => {
  mocks.academies.mockResolvedValue([academy, otherAcademy]);
  const draft = { title: "Roots", description: "", items: [], accessDays: 11 };
  const row = { id: unitId, version: 3, state: "draft", draft };
  const otherRow = { ...row, id: otherId };
  const rpc = vi.fn(async (name: string) => name === "consume_api_quota" ? { data: { allowed: true }, error: null } : { data: 4, error: null });
  const db = { rpc, from: () => ({ select: () => {
    const filters = new Map<string, unknown>();
    const query = { eq(key: string, value: unknown) { filters.set(key, value); return query; }, maybeSingle: async () => ({
      data: filters.get("academy_id") === academy.id && filters.get("id") === unitId ? row
        : filters.get("academy_id") === otherAcademy.id && filters.get("id") === otherId ? otherRow : null, error: null,
    }) };
    return query;
  } }) };
  mocks.bearer.mockImplementation(async (token: string) => token === "test-supabase-session" ? { userId: "staff", db } as unknown as Authority : null);
  const { access_token: token } = await (await exchange(await issueCode())).json();
  const transport = new StreamableHTTPClientTransport(new URL(resource), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    fetch: (input, init) => handleMcp(new Request(input, init)),
  });
  const client = new Client({ name: "test", version: "1" });
  await client.connect(transport);
  try {
    expect((await client.listTools()).tools.map(tool => tool.name)).toContain("update_lesson_draft");
    expect((await client.callTool({ name: "get_lesson", arguments: { id: unitId } })).structuredContent).toMatchObject({ title: "Roots", version: 3 });
    expect((await client.callTool({ name: "update_lesson_draft", arguments: { id: otherId, version: 3, title: "Wrong academy" } })).isError).toBe(true);
    expect((await client.callTool({ name: "update_lesson_draft", arguments: { id: unitId, version: 2, title: "Stale" } })).isError).toBe(true);
    expect(rpc.mock.calls.filter(([name]) => name === "save_content_unit")).toHaveLength(0);
    expect((await client.callTool({ name: "update_lesson_draft", arguments: { id: unitId, version: 3, title: "Square roots" } })).structuredContent).toEqual({ id: unitId, version: 4, title: "Square roots" });
    expect(rpc).toHaveBeenCalledWith("save_content_unit", { p_academy_id: academy.id, p_unit_id: unitId, p_version: 3, p_document: { ...draft, title: "Square roots" } });
    mocks.academies.mockResolvedValueOnce([otherAcademy]);
    const authenticated = () => handleMcp(new Request(resource, { method: "POST", headers: { Authorization: `Bearer ${token}` } }));
    expect((await authenticated()).status).toBe(401);
    rpc.mockResolvedValueOnce({ data: { allowed: false }, error: null });
    expect((await authenticated()).status).toBe(429);
    expect((await post("/revoke", { client_id: clientId, token })).ok).toBe(true);
    expect((await authenticated()).status).toBe(401);
  } finally { await client.close(); }
});
