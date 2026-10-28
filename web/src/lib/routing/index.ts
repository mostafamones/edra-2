/** Public URLs are independent of the internal App Router namespaces. */
export type Platform = "marketing" | "staff" | "student";
export type RouteDescriptor = { platform: Platform; scope: "global" | "academy"; academySlug?: string; path: string; canonical: string; internalPath: string; legacy?: boolean };
export const STUDENT_GLOBAL_PATHS = ["profile", "calendar", "content", "discover", "courses", "assignments", "quizzes", "exams", "attendance", "results"] as const;
export const RESERVED_NAMESPACES = ["app", "learn", "auth", "onboarding", "api", "invite", "account", ...STUDENT_GLOBAL_PATHS] as const;
export const ROUTE_HEADER = "x-edra-platform";
export const PUBLIC_PATH_HEADER = "x-edra-public-path";

function origin(value: string | undefined, fallback: string) {
  if (!value) {
    if (process.env.NODE_ENV === "production") throw new Error("Explicit platform origins are required in production.");
    value = fallback;
  }
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error("Invalid platform origin.");
  if (process.env.NODE_ENV === "production" && url.protocol !== 'https:') throw new Error("Production origins require HTTPS.");
  return url.origin;
}
/** NEXT_PUBLIC values are explicit browser configuration; EDRA_* overrides are server-only. */
export function platformOrigins() {
  const browser = typeof window !== "undefined";
  const values = {
    marketing: { server: !browser ? process.env.EDRA_MARKETING_ORIGIN : undefined, public: process.env.NEXT_PUBLIC_EDRA_MARKETING_ORIGIN, fallback: "http://lvh.me:3000" },
    staff: { server: !browser ? process.env.EDRA_APP_ORIGIN : undefined, public: process.env.NEXT_PUBLIC_EDRA_APP_ORIGIN, fallback: "http://app.lvh.me:3000" },
    student: { server: !browser ? process.env.EDRA_LEARN_ORIGIN : undefined, public: process.env.NEXT_PUBLIC_EDRA_LEARN_ORIGIN, fallback: "http://learn.lvh.me:3000" },
  };
  const result = {} as Record<Platform, string>;
  for (const platform of ["marketing", "staff", "student"] as const) {
    const value = values[platform];
    result[platform] = origin(value.server || value.public, value.fallback);
    if (value.server && value.public && origin(value.public, value.fallback) !== result[platform]) throw new Error("Server and browser platform origins must match.");
  }
  if (new Set(Object.values(result)).size !== 3) throw new Error("Platform origins must be distinct.");
  return result;
}
export function platformOrigin(platform: Platform) { return platformOrigins()[platform]; }
/** Optional server-only staff alias for a development tunnel: one exact host[:port], never used in production. */
function developmentTunnelHost() {
  if (process.env.NODE_ENV === "production") return null;
  const value = process.env.EDRA_DEV_TUNNEL_HOST?.toLowerCase();
  // Hostname labels plus an optional port only: a scheme, path, userinfo, wildcard or control character is rejected.
  return value && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*(?::\d{1,5})?$/.test(value) ? value : null;
}
export function classifyHost(host: string): Platform | null {
  const origins = platformOrigins();
  for (const platform of ["marketing", "staff", "student"] as const) if (host.toLowerCase() === new URL(origins[platform]).host.toLowerCase()) return platform;
  const tunnel = developmentTunnelHost();
  if (tunnel && host.toLowerCase() === tunnel) return "staff";
  // localhost is a bounded, development-only legacy marketing entry.
  if (process.env.NODE_ENV !== "production" && ["localhost:3000", "127.0.0.1:3000"].includes(host)) return "marketing";
  return null;
}
export function validAcademySlug(slug: string) { return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 50 && !RESERVED_NAMESPACES.includes(slug as typeof RESERVED_NAMESPACES[number]); }
function suffix(path: string) { return path === "" || path === "/" ? "" : path.startsWith("/") ? path : `/${path}`; }
export function staffAcademyPath(slug: string, path = "") {
  if (!validAcademySlug(slug)) throw new Error("Invalid academy slug.");
  return `/${slug}${suffix(path)}`;
}
export function staffAcademyHref(slug: string, path = "") { return platformOrigin("staff") + staffAcademyPath(slug, path); }
export function studentHref(path = "/") { return platformOrigin("student") + (path.startsWith("/") ? path : `/${path}`); }
/** Academy path on the student host, for same-host links. */
export function studentAcademyPath(slug: string, path = "") { return staffAcademyPath(slug, path); }
/** A student list page (courses, assignments…), filtered to one academy when `slug` is given. */
export function studentListPath(section: string, slug?: string, query: Record<string, string> = {}) {
  const params = new URLSearchParams({ ...(slug && { academy: slug }), ...query });
  return `/${section}${params.size ? `?${params}` : ""}`;
}
export function studentAcademyHref(slug: string, path = "") { return platformOrigin("student") + staffAcademyPath(slug, path); }
export function staffEntryHref() { return platformOrigin("staff") + "/"; }
export function authHref(path = "login", platform: "staff" | "student" = "staff", next?: string) { return `${platformOrigin(platform)}/auth/${path}${next ? `?next=${encodeURIComponent(next)}` : ""}`; }
export function onboardingHref(path = "", platform: "staff" | "student" = "staff") { return `${platformOrigin(platform)}/onboarding${suffix(path)}`; }
export function staffInviteHref(token: string) { return `${platformOrigin("staff")}/invite/staff/${encodeURIComponent(token)}`; }
export function studentInviteHref(token: string) { return `${platformOrigin("student")}/invite/student/${encodeURIComponent(token)}`; }
/** The public booking form; `/join` hands a signed-in student to academy onboarding. */
export function studentBookingHref(token: string, path: "" | "/join" = "") { return `${platformOrigin("student")}/invite/booking/${encodeURIComponent(token)}${path}`; }
/** Manifest identifiers remain internal, while rendered hrefs are canonical. */
export function publicHref(internal: string, slug?: string) {
  if (internal === "/app/manage/account" && !slug) return platformOrigin("staff") + "/account";
  if (internal === "/app" || internal.startsWith("/app/")) return slug ? staffAcademyHref(slug, internal.slice(4)) : staffEntryHref();
  if (internal === "/learn" || internal.startsWith("/learn/")) return studentHref(internal.slice(6) || "/");
  return internal;
}
export function internalStaffPath(pathname: string, slug?: string) {
  if (pathname === "/account") return "/app/manage/account";
  if (slug && (pathname === `/${slug}` || pathname.startsWith(`/${slug}/`))) return `/app${pathname.slice(slug.length + 1)}`;
  if (slug && (pathname === `/app/${slug}` || pathname.startsWith(`/app/${slug}/`))) return `/app${pathname.slice(slug.length + 5)}`;
  return pathname;
}
export function internalStudentPath(pathname: string) { return pathname === "/learn" || pathname.startsWith("/learn/") ? pathname : `/learn${pathname === "/" ? "" : pathname}`; }
export function describeRoute(platform: Platform, path: string): RouteDescriptor {
  const pathname = path.split("?")[0];
  const common = /^(?:\/auth|\/onboarding|\/invite|\/api|\/_next)(?:\/|$)/.test(pathname);
  let internalPath = pathname;
  let academySlug: string | undefined;
  let legacy = false;
  if (!common && platform === "staff" && pathname !== "/account") {
    legacy = pathname === "/app" || pathname.startsWith("/app/");
    if (!legacy && pathname !== "/") academySlug = pathname.split("/")[1];
    internalPath = legacy ? pathname : pathname === "/" ? "/app" : `/app${pathname}`;
  }
  if (!common && platform === "student") {
    legacy = pathname === "/learn" || pathname.startsWith("/learn/");
    const first = pathname.split("/")[1];
    if (!legacy && first && !STUDENT_GLOBAL_PATHS.includes(first as typeof STUDENT_GLOBAL_PATHS[number])) academySlug = first;
    internalPath = legacy ? pathname : academySlug ? `/learn/academy${pathname}` : `/learn${pathname === "/" ? "" : pathname}`;
  }
  return { platform, scope: academySlug ? "academy" : "global", academySlug, path, canonical: platformOrigin(platform) + path, internalPath, legacy };
}
export type ReturnDestination = { platform: "staff" | "student"; path: string };
export function safeRelativePath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1200 || !value.startsWith("/") || value.startsWith("//")) return null;
  try {
    let decoded = value;
    for (let i = 0; i < 3; i++) { const next = decodeURIComponent(decoded); if (next === decoded) break; decoded = next; }
    if (decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded) || /%[0-9a-f]{2}/i.test(decoded)) return null;
    const decodedUrl = new URL(decoded, "https://routing.invalid");
    if (decodedUrl.origin !== "https://routing.invalid" || /^(?:\/auth|\/api|\/_next|\/invite)(?:\/|$)/.test(decodedUrl.pathname)) return null;
    const url = new URL(value, "https://routing.invalid");
    if (url.origin !== "https://routing.invalid" || url.hash || /^(?:\/auth|\/api|\/_next|\/invite)(?:\/|$)/.test(url.pathname)) return null;
    return url.pathname + url.search;
  } catch { return null; }
}
export function validateReturnDestination(value: unknown, platform: "staff" | "student" = "staff"): ReturnDestination | null {
  if (typeof value !== "string") return null;
  if (value.startsWith("/")) {
    const path = safeRelativePath(value);
    return path ? { platform, path } : null;
  }
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    const target = (["staff", "student"] as const).find(p => platformOrigin(p) === url.origin);
    const path = safeRelativePath(url.pathname + url.search + url.hash);
    return target && path ? { platform: target, path } : null;
  } catch { return null; }
}
export function returnDestinationHref(destination: ReturnDestination) { return platformOrigin(destination.platform) + destination.path; }
