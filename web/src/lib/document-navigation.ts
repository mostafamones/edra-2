/** Legacy namespaces must reach the gateway before Router canonicalizes them. */
export function legacyDocumentPath(href: string) {
  return /^\/(?:app|learn)(?:\/|$)/.test(new URL(href, "https://routing.invalid").pathname);
}

export function requiresDocumentNavigation(href: string, base: string) {
  return new URL(href, base).origin !== new URL(base).origin || legacyDocumentPath(href);
}
