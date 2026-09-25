const ALLOWED_ROOTS = ["/app", "/learn", "/onboarding"];

export function safeNextPath(value: unknown, fallback = "/app") {
  if (typeof value !== "string" || value.length > 1200 || !value.startsWith("/") ||
    value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) {
    return fallback;
  }

  try {
    const url = new URL(value, "https://edra.local");
    if (url.origin !== "https://edra.local" ||
      !ALLOWED_ROOTS.some((root) => url.pathname === root || url.pathname.startsWith(`${root}/`))) {
      return fallback;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
