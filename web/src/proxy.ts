import { NextResponse, type NextRequest } from "next/server";
import {
  classifyHost, describeRoute, platformOrigin, PUBLIC_PATH_HEADER, ROUTE_HEADER,
} from "./lib/routing";
import { updateSession } from "./lib/supabase/middleware";

const READ_METHODS = new Set(["GET", "HEAD"]);
const INFRASTRUCTURE = /^(?:\/api|\/_next)(?:\/|$)|^\/(?:favicon\.ico|robots\.txt|sitemap\.xml|(?:next|vercel|file|globe|window)\.svg)$/;

/** Refresh metadata must survive the response replacement used by host rewrites. */
function preserveSession(source: NextResponse, target: NextResponse) {
  source.headers.forEach((value, name) => {
    if (name !== "set-cookie" && !name.startsWith("x-middleware-")) target.headers.set(name, value);
  });
  source.headers.getSetCookie().forEach(cookie => target.headers.append("set-cookie", cookie));
  return target;
}

export async function proxy(request: NextRequest) {
  // The URL is normalized by Next; classification deliberately uses the actual Host.
  const platform = classifyHost(request.headers.get("host") ?? "");
  if (!platform) return new NextResponse("Unknown platform host", { status: 421 });
  const publicPath = request.nextUrl.pathname + request.nextUrl.search;
  const descriptor = describeRoute(platform, publicPath);
  request.headers.set(ROUTE_HEADER, platform);
  request.headers.set(PUBLIC_PATH_HEADER, publicPath);
  const pathname = request.nextUrl.pathname;
  const legacyPlatform = /^\/app(?:\/|$)/.test(pathname) ? "staff"
    : /^\/learn(?:\/|$)/.test(pathname) ? "student" : null;

  // Compatibility links are navigations. A submitted action never crosses origins.
  if (legacyPlatform && (platform === "marketing" || platform !== legacyPlatform)) {
    if (!READ_METHODS.has(request.method)) return new NextResponse("Use the canonical platform URL", { status: 409 });
    const session = await updateSession(request, descriptor);
    return preserveSession(session, NextResponse.redirect(new URL(publicPath, platformOrigin(legacyPlatform)), 307));
  }

  const session = await updateSession(request, descriptor);
  if (session.headers.has("location")) return session;
  if (INFRASTRUCTURE.test(pathname)) return session;

  // Keep rewrites on Next's request origin. The public Host can differ from
  // that origin in development or behind a reverse proxy; using a configured
  // public origin here would turn an internal rewrite into an external fetch
  // back through this proxy and canonicalize the internal path again.
  const destination = request.nextUrl.clone();
  destination.search = request.nextUrl.search;
  // In dev, nextUrl can carry the bind hostname (e.g. localhost) instead of the public Host; a differing
  // origin makes Next proxy the rewrite as an external fetch, which the host check then rejects.
  destination.host = request.headers.get("host") ?? destination.host;
  if (platform === "staff" && descriptor.legacy) {
    if (!READ_METHODS.has(request.method)) return preserveSession(session, new NextResponse("Use the canonical academy URL", { status: 409 }));
    destination.pathname = "/app";
  } else if (platform === "student" && descriptor.legacy) {
    if (!READ_METHODS.has(request.method)) return preserveSession(session, new NextResponse("Use the canonical student URL", { status: 409 }));
    const canonical = new URL(platformOrigin("student"));
    canonical.pathname = pathname.slice(6) || "/";
    canonical.search = request.nextUrl.search;
    return preserveSession(session, NextResponse.redirect(canonical, 307));
  } else {
    destination.pathname = descriptor.internalPath;
  }
  if (destination.pathname === pathname) return session;
  // updateSession mutates request cookies during refresh; forward that final header set.
  return preserveSession(session, NextResponse.rewrite(destination, { request: { headers: request.headers } }));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|(?:next|vercel|file|globe|window)\\.svg$).*)"],
};
