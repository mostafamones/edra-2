import "@tanstack/react-start/server-only";
import { z } from "zod";
import { getRequest } from "@/lib/server/request";
import { platformOrigin } from "@/lib/routing";
import { cookieAuthority, bearerAuthority } from "@/lib/supabase/authority";
import { createClient } from "@/lib/supabase/server";
import { listStaffAcademies } from "@/modules/academies/server";
import type { GrantNamespace } from "./grants";

export const mcpPath = "/api/mcp";
export const consentPath = "/auth/chatgpt";
export const protectedPath = "/.well-known/oauth-protected-resource/api/mcp";
export const scope = "edra:lessons";
const verifierPattern = /^[A-Za-z0-9._~-]{43,128}$/;
const credentialPattern = /^([a-f0-9]{32})\.([a-f0-9]{64})$/;
const oauthFields = ["response_type", "client_id", "redirect_uri", "resource", "scope", "state", "code_challenge", "code_challenge_method"] as const;

export function config() {
  const { EDRA_MCP_CLIENT_ID: clientId, EDRA_MCP_GRANT_KEY: key, EDRA_MCP_REDIRECT_URI: redirectUri } = process.env;
  if (clientId !== "https://chatgpt.com/oauth/client.json" || !key || !/^[a-f0-9]{64}$/i.test(key) || !redirectUri) return null;
  try {
    const callback = new URL(redirectUri);
    const origin = new URL(platformOrigin("staff")).origin;
    if (!origin.startsWith("https://") || callback.origin !== "https://chatgpt.com" || callback.username || callback.password || callback.hash) return null;
    return { clientId, key, redirectUri, origin, resource: origin + mcpPath };
  } catch { return null; }
}
type Config = NonNullable<ReturnType<typeof config>>;

function parseConsent(params: URLSearchParams, cfg: Config) {
  if (oauthFields.some(key => params.getAll(key).length > 1)) return null;
  const challenge = params.get("code_challenge");
  const state = params.get("state");
  if (params.get("response_type") !== "code" || params.get("client_id") !== cfg.clientId
    || params.get("redirect_uri") !== cfg.redirectUri || params.get("code_challenge_method") !== "S256"
    || !challenge || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || !state || state.length > 256
    || params.get("resource") !== cfg.resource || ![null, scope].includes(params.get("scope"))) return null;
  return { challenge, state, fields: oauthFields.flatMap(key => params.has(key) ? [[key, params.get(key)!] as const] : []) };
}

export async function loadMcpConsent(data: { query: string }) {
  const cfg = config();
  if (!cfg || new URL(getRequest().url).origin !== cfg.origin) return { status: "unavailable" } as const;
  const consent = parseConsent(new URLSearchParams(data.query), cfg);
  if (!consent) return { status: "invalid" } as const;
  if (!await approvedClient(cfg)) return { status: "unavailable" } as const;
  const authority = await cookieAuthority();
  if (!authority) return { status: "sign-in" } as const;
  try {
    const academies = (await listStaffAcademies(authority)).map(({ id, name }) => ({ id, name }));
    return { status: "ready", fields: consent.fields, academies } as const;
  } catch { return { status: "unavailable" } as const; }
}

const noStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
function oauthError(error: string, status = 400) { return Response.json({ error }, { status, headers: noStore }); }
async function form(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded" || !request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0, text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) { await reader.cancel(); return null; }
    text += decoder.decode(value, { stream: true });
  }
  const params = new URLSearchParams(text + decoder.decode());
  return [...params.keys()].some(key => params.getAll(key).length > 1) ? null : params;
}

const random = () => crypto.randomUUID().replaceAll("-", "");
async function hash(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function grantRequest(store: GrantNamespace, id: string, operation: string, payload: object) {
  return store.get(store.idFromName(id)).fetch(new Request(`https://grant.internal/${operation}`, { method: "POST", body: JSON.stringify(payload) }));
}
function callback(cfg: Config, state: string, result: { code: string } | { error: string }) {
  const url = new URL(cfg.redirectUri);
  for (const [key, value] of Object.entries({ ...result, state, iss: cfg.origin })) url.searchParams.set(key, value);
  return new Response(null, { status: 303, headers: { ...noStore, Location: url.href } });
}
async function consent(request: Request, cfg: Config, store: GrantNamespace) {
  if (request.headers.get("origin") !== cfg.origin) return oauthError("invalid_request", 403);
  const input = await form(request);
  const authorization = input && parseConsent(input, cfg);
  if (!input || !authorization) return oauthError("invalid_request");
  const { state, challenge } = authorization;
  if (!await approvedClient(cfg)) return oauthError("invalid_client", 403);
  if (input.get("decision") === "deny") return callback(cfg, state, { error: "access_denied" });
  const academyId = input.get("academy_id");
  if (input.get("decision") !== "allow" || !z.guid().safeParse(academyId).success) return oauthError("invalid_request");
  const db = await createClient();
  // Only the verified access token is retained. The user's refresh token and session cookies never leave Edra.
  const { data: { session } } = await db.auth.getSession();
  const verified = session && await bearerAuthority(session.access_token);
  if (!session || !verified || !session.expires_at || !academyId) return callback(cfg, state, { error: "access_denied" });
  const academies = await listStaffAcademies(verified);
  if (!academies.some(academy => academy.id === academyId)) return callback(cfg, state, { error: "access_denied" });
  const id = random(), secret = random() + random(), now = Date.now();
  const sessionExpires = Math.min(session.expires_at * 1000, now + 60 * 60_000);
  const result = await grantRequest(store, id, "create", { grant: {
    academyId, sealedSession: await seal(cfg, id, session.access_token), sessionExpires, challenge, redirectUri: cfg.redirectUri, resource: cfg.resource, scope,
    codeHash: await hash(secret), codeExpires: Math.min(now + 120_000, sessionExpires),
  } });
  if (!result.ok) return oauthError("server_error", 500);
  return callback(cfg, state, { code: `${id}.${secret}` });
}
async function approvedClient(cfg: Config) {
  try {
    // Pin the metadata URL; never fetch a URL supplied by an OAuth request.
    const response = await fetch(cfg.clientId, { redirect: "error", signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } });
    if (!response.ok) return false;
    const metadata = await response.json() as Record<string, unknown>;
    const methods = metadata.token_endpoint_auth_methods_supported ?? [metadata.token_endpoint_auth_method];
    return metadata.client_id === cfg.clientId && Array.isArray(metadata.redirect_uris) && metadata.redirect_uris.includes(cfg.redirectUri)
      && Array.isArray(methods) && methods.includes("none");
  } catch { return false; }
}

async function encryptionKey(cfg: Config) {
  const bytes = Uint8Array.from(cfg.key.match(/../g)!, hex => Number.parseInt(hex, 16));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
function additionalData(cfg: Config, id: string) { return new TextEncoder().encode([cfg.resource, scope, id].join("|")); }
async function seal(cfg: Config, id: string, token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: additionalData(cfg, id) }, await encryptionKey(cfg), new TextEncoder().encode(token));
  return [...iv, ...new Uint8Array(encrypted)];
}
async function unseal(cfg: Config, id: string, value: number[]) {
  try {
    const bytes = Uint8Array.from(value);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: additionalData(cfg, id) }, await encryptionKey(cfg), bytes.slice(12));
    return new TextDecoder().decode(decrypted);
  } catch { return null; }
}

export async function authorizeTools(request: Request, cfg: Config, store: GrantNamespace) {
  const match = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") ?? "");
  const parts = match && credentialPattern.exec(match[1]);
  if (!parts) return null;
  const response = await grantRequest(store, parts[1], "read", { hash: await hash(parts[2]) });
  if (!response.ok) return null;
  const grant = await response.json() as { academyId: string; sealedSession: number[]; resource: string; scope: string };
  if (grant.resource !== cfg.resource || grant.scope !== scope) return null;
  const decoded = await unseal(cfg, parts[1], grant.sealedSession);
  if (!decoded) return null;
  const authority = await bearerAuthority(decoded);
  if (!authority) return null;
  const quota = await authority.db.rpc("consume_api_quota", { p_bucket: "api:mcp", p_limit: 120, p_window_seconds: 60 });
  if (quota.error?.code === "EDRA_SESSION_INACTIVE") return null;
  if (quota.error) return { error: 503 } as const;
  if ((quota.data as { allowed?: boolean } | null)?.allowed !== true) return { error: 429 } as const;
  const academy = (await listStaffAcademies(authority)).find(item => item.id === grant.academyId);
  return academy ? { authority, academy } : null;
}

export async function oauth(request: Request, path: string, cfg: Config, store: GrantNamespace) {
  if (request.method === "GET" || request.method === "HEAD") {
    const metadata = path === protectedPath || path === "/.well-known/oauth-protected-resource" ? {
      resource: cfg.resource, authorization_servers: [cfg.origin], scopes_supported: [scope], bearer_methods_supported: ["header"],
    } : path === "/.well-known/oauth-authorization-server" ? {
      issuer: cfg.origin, authorization_response_iss_parameter_supported: true, client_id_metadata_document_supported: true, authorization_endpoint: cfg.origin + consentPath, token_endpoint: `${cfg.resource}/token`,
      revocation_endpoint: `${cfg.resource}/revoke`, scopes_supported: [scope], response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"], code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
    } : null;
    if (metadata) return request.method === "GET" ? Response.json(metadata, { headers: noStore }) : new Response(null, { headers: noStore });
  }
  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (path === `${mcpPath}/authorize`) return consent(request, cfg, store);
  if (path !== `${mcpPath}/token` && path !== `${mcpPath}/revoke`) return new Response(null, { status: 405 });
  const input = await form(request);
  if (!input) return oauthError("invalid_request");
  if (request.headers.has("authorization") || input.get("client_id") !== cfg.clientId || input.has("client_secret") || input.has("client_assertion")) return oauthError("invalid_client", 401);
  if (path === `${mcpPath}/revoke`) {
    const parts = credentialPattern.exec(input.get("token") ?? "");
    if (parts) await grantRequest(store, parts[1], "revoke", { hash: await hash(parts[2]) });
    return new Response(null, { headers: noStore });
  }
  if (input.get("grant_type") !== "authorization_code") return oauthError("unsupported_grant_type");
  const resource = input.get("resource");
  if (resource !== cfg.resource) return oauthError("invalid_target");
  const parts = credentialPattern.exec(input.get("code") ?? ""), verifier = input.get("code_verifier") ?? "";
  if (!parts || !verifierPattern.test(verifier) || input.get("redirect_uri") !== cfg.redirectUri) return oauthError("invalid_grant");
  const token = random() + random();
  const result = await grantRequest(store, parts[1], "exchange", {
    hash: await hash(parts[2]), challenge: await hash(verifier), redirectUri: cfg.redirectUri, resource, accessHash: await hash(token),
  });
  if (!result.ok) return oauthError("invalid_grant");
  const { expiresIn } = await result.json() as { expiresIn: number };
  return Response.json({ access_token: `${parts[1]}.${token}`, token_type: "Bearer", expires_in: expiresIn, scope }, { headers: noStore });
}
