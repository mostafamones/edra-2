import "@tanstack/react-start/server-only";
import { env } from "cloudflare:workers";
import { authorizeTools, config, mcpPath, oauth, protectedPath, scope } from "./oauth.server";

export async function handleMcp(request: Request) {
  const cfg = config(), store = env.EDRA_MCP_GRANTS;
  const url = new URL(request.url);
  if (!cfg || !store || url.origin !== cfg.origin) return new Response(null, { status: 404 });
  try {
    if (url.pathname !== mcpPath) return await oauth(request, url.pathname, cfg, store);
    const origin = request.headers.get("origin");
    if (origin && origin !== cfg.origin && origin !== new URL(cfg.redirectUri).origin) return new Response(null, { status: 403 });
    const context = await authorizeTools(request, cfg, store);
    if (!context) return new Response(null, { status: 401, headers: {
      "Cache-Control": "no-store", "WWW-Authenticate": `Bearer resource_metadata="${cfg.origin}${protectedPath}", scope="${scope}"`,
    } });
    if ("error" in context) return new Response(null, { status: context.error, headers: context.error === 429 ? { "Retry-After": "60" } : {} });
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
    const { serveTools } = await import("./tools.server");
    const response = await serveTools(request, context.authority, context.academy);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    // Provider failures must never fall back to broader authorization or expose the grant.
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
