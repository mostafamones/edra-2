/** An exact development alias, never a URL, wildcard, suffix rule or authority. */
export function validDevelopmentTunnelHost(value: string | undefined): string | null {
  const host = value?.toLowerCase();
  return host && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*(?::\d{1,5})?$/.test(host) ? host : null;
}
