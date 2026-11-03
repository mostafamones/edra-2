import worker from "./index.mjs";

const origins = ["https://edra.test", "https://app.edra.test", "https://learn.edra.test"];
function assert(ok, message) { if (!ok) throw new Error(message); }
async function request(url, env, ctx, headers = {}) { return worker.fetch(new Request(url, { headers: { host: new URL(url).host, ...headers } }), env, ctx); }
export default {
  async test(_controller, env, ctx) {
    const unknown = await request("https://unknown.test/", env, ctx);
    assert(unknown.status === 421, "Unknown host must return 421");
    const legacy = await request(`${origins[0]}/app?check=kept`, env, ctx);
    assert(legacy.status === 307 && new URL(legacy.headers.get("location"), origins[1]).search === "?check=kept", "Legacy redirect must preserve query");
    const page = await request(`${origins[1]}/`, env, ctx);
    assert(page.status >= 300 && page.status < 400, "Staff page must redirect unauthenticated users");
    assert(/private/i.test(page.headers.get("cache-control") ?? "") && /no-store/i.test(page.headers.get("cache-control") ?? ""), "Staff redirect must not be cached");
    const cookie = await request(`${origins[1]}/auth/login`, env, ctx, { cookie: "sb-supabase-auth-token-code-verifier=fixture" });
    assert((cookie.headers.get("set-cookie") ?? "").includes("sb-supabase-auth-token-code-verifier="), "Legacy cookie deletion must survive the response");
    for (const origin of origins) {
      const response = await request(`${origin}/api/v1/academies`, env, ctx);
      assert((response.headers.get("content-type") ?? "").includes("application/json"), "API server route must return JSON on every host");
      assert(response.status !== 404 && response.status !== 421 && response.status < 500, "API server route must be reached on every host");
    }
    const send = (url, method, headers = {}, body) => worker.fetch(new Request(url, { method, headers: { host: new URL(url).host, ...headers }, body, duplex: body ? "half" : undefined }), env, ctx);
    // Legacy matrix: a submitted request never crosses origins; navigations keep their query.
    assert((await send(`${origins[0]}/app`, "POST")).status === 409, "Cross-host legacy POST must be 409");
    const studentLegacy = await send(`${origins[2]}/learn/courses?a=b%20c`, "GET");
    // Signed out, the session redirect wins (as in the old proxy) and carries the original path and query.
    assert(studentLegacy.status === 307 && new URL(studentLegacy.headers.get("location")).searchParams.get("next") === "/learn/courses?a=b%20c", "Signed-out student legacy GET must go to login with next");
    assert((await send(`${origins[2]}/learn/courses`, "POST")).status === 409, "Student legacy POST must be 409");
    assert((await send(`${origins[1]}/app/x`, "POST")).status === 409, "Staff legacy POST must be 409");
    // API methods, CORS preflight, and auth stay distinct through the gateway with a real body.
    const api = `${origins[1]}/api/v1/sessions/00000000-0000-4000-8000-000000000000/attendance/bulk`;
    const unauth = await send(api, "POST", { "content-type": "application/json" }, "{}");
    assert(unauth.status === 401 && (await unauth.json()).error?.code === "UNAUTHENTICATED", "Unauthenticated POST with a body must be 401");
    const mixed = await send(api, "POST", { authorization: "Bearer aaaaaaaaaa.bbbbbbbbbb.cccccccccc", cookie: "edra-auth-v1=fixture", "content-type": "application/json" }, "{}");
    const mixedBody = await mixed.text();
    assert(mixed.status === 400 && JSON.parse(mixedBody).error?.code === "AMBIGUOUS_AUTHENTICATION", `Bearer plus cookie must be rejected as ambiguous (got ${mixed.status} ${mixedBody.slice(0, 200)})`);
    const denied = await send(`${origins[1]}/api/v1/academies`, "DELETE");
    assert(denied.status === 405 && !denied.headers.has("allow") && (await denied.text()) === "", "Unsupported method must be an empty 405 without Allow, as Next returned");
    assert((await send(`${origins[1]}/api/v1/academies`, "PROPFIND")).status === 400, "Unrecognized method must be 400");
    const preflight = await send(`${origins[1]}/api/sessions`, "OPTIONS");
    assert(preflight.status === 204 && preflight.headers.get("allow") === "GET, HEAD, OPTIONS", "Automatic OPTIONS must list sorted methods");
    // Real dispatch: a static sibling beats the param, and encoded params reach the handler.
    const attendance = `${origins[1]}/api/v1/sessions/00000000-0000-4000-8000-000000000000/attendance`;
    assert((await send(`${attendance}/bulk`, "PATCH")).status === 405, "Static sibling must win over $annualRecordId");
    assert((await send(`${attendance}/00000000-0000-4000-8000-000000000001`, "PATCH")).status === 401, "Param route must reach its handler");
    assert((await send(`${attendance}/a%2Fb`, "PATCH")).status === 401, "Encoded slash must stay one param");
    assert((await send(`${origins[1]}/api/does-not-exist`, "GET")).status === 404, "Unknown API path must be 404");
    const slash = await send(`${origins[1]}/api/v1/academies/?a=1`, "POST");
    assert(slash.status === 308 && slash.headers.get("location") === `${origins[1]}/api/v1/academies?a=1`, "Trailing slash must 308 as in Next");
    assert((await send(`${origins[1]}/api/sessions/%E0%A4%A`, "GET")).status === 400, "Undecodable path must be 400");
    const query = await send(`${origins[1]}/auth/login?next=/a%20b`, "GET");
    assert(query.status === 200, `A non-canonical query must render without a redirect (got ${query.status})`);
    assert((await send(`${origins[1]}/api/v1/academies`, "HEAD")).status !== 405, "HEAD must follow GET");
    // Server functions: size limit before parsing, and cross-origin rejection.
    const large = await send(`${origins[1]}/_serverFn/fixture`, "POST", { "content-length": String(1024 * 1024 + 1), "sec-fetch-site": "same-origin" }, "x");
    assert(large.status === 413 && /no-store/.test(large.headers.get("cache-control") ?? ""), "Oversized server-function body must be 413 and uncached");
    const forged = await send(`${origins[1]}/_serverFn/fixture`, "POST", { origin: "https://evil.test", "sec-fetch-site": "cross-site" }, "{}");
    assert(forged.status === 403, `Cross-site server-function POST must be 403 (got ${forged.status})`);
    // IDs come from the actual built resolver, never an invented production endpoint.
    const ids = JSON.parse(env.TEST_RPC_IDS);
    const rpc = (id) => `${origins[1]}/_serverFn/${id}`;
    const rpcHeaders = { "x-tsr-serverfn": "true", "sec-fetch-site": "same-origin" };
    const read = await send(rpc(ids.getSignedIn), "GET", rpcHeaders);
    assert(read.status === 200 && /application\/json/.test(read.headers.get("content-type") ?? "") && read.headers.get("x-tss-serialized") === "true", "Real GET RPC must serialize JSON");
    assert(/no-store/.test(read.headers.get("cache-control") ?? ""), "RPC response must be uncached");
    const missing = await send(rpc("unknown"), "GET", rpcHeaders);
    assert(missing.status === 500, "Unknown RPC ID must fail closed");
    const malformed = await send(rpc(ids.searchAcademyFn), "POST", { ...rpcHeaders, "content-type": "application/json" }, "{");
    assert(malformed.status >= 400 && /application\/json/.test(malformed.headers.get("content-type") ?? ""), "Malformed real RPC must fail as JSON");
    const invalid = await send(rpc(ids.searchAcademyFn), "POST", { ...rpcHeaders, "content-type": "application/json" }, "{}");
    const invalidBody = await invalid.text();
    assert(invalid.status >= 400 && invalid.headers.get("x-tss-serialized") === "true", "Invalid RPC must serialize its error");
    assert(!/stack|SUPABASE_|ZodError|invalid_type/i.test(invalidBody), "Production RPC error must redact private details");
    const redirect = await send(rpc(ids.loadAccount), "GET", { ...rpcHeaders, cookie: "sb-supabase-auth-token-code-verifier=fixture" });
    // Start serializes RPC redirects so that fetch cannot follow them (createStartHandler.ts ~1072).
    const redirectBody = await redirect.clone().json();
    assert(redirect.status === 200 && !redirect.headers.has("location") && redirectBody.isSerializedRedirect === true && /auth\/login/.test(redirectBody.href ?? ""), "RPC redirect must use the serialized envelope");
    assert((redirect.headers.get("set-cookie") ?? "").includes("sb-supabase-auth-token-code-verifier="), "RPC must preserve Set-Cookie");
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); controller.enqueue(new Uint8Array(1)); controller.close(); } });
    const chunked = await send(rpc(ids.searchAcademyFn), "POST", { ...rpcHeaders, "content-type": "application/json" }, stream);
    assert(chunked.status === 413 && /no-store/.test(chunked.headers.get("cache-control") ?? ""), "Unknown-length oversized RPC must be rejected");
    const sameOrigin = await send(rpc(ids.searchAcademyFn), "POST", { ...rpcHeaders, origin: origins[1], "content-type": "application/json" }, "{}");
    assert(sameOrigin.status !== 403, "Same-origin RPC must pass CSRF");
    const crossSite = await send(rpc(ids.searchAcademyFn), "POST", { ...rpcHeaders, origin: "https://evil.test", "sec-fetch-site": "cross-site", "content-type": "application/json" }, "{}");
    assert(crossSite.status === 403, "Cross-site real RPC must fail CSRF");
    // A hostile cookie name must not take the gateway down.
    assert((await send(`${origins[0]}/api/v1/academies`, "GET", { cookie: "bad name=1; ok=2" })).status < 500, "Unusual cookie names must not fail the request");
    // Actual HTML from the Worker on the marketing and auth pages.
    for (const url of [`${origins[0]}/`, `${origins[1]}/auth/login`, `${origins[2]}/auth/login`]) {
      const html = await send(url, "GET");
      assert(html.status === 200 && (html.headers.get("content-type") ?? "").includes("text/html") && (await html.text()).includes("<html"), `SSR must render ${url} (got ${html.status})`);
      assert(/private/.test(html.headers.get("cache-control") ?? "") && /no-store/.test(html.headers.get("cache-control") ?? ""), `SSR ${url} must be private, no-store`);
    }
  },
};
