import "server-only";

export const CONTROL_COOKIE = "edra-dev-control";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type DevelopmentConfig = {
  url: string;
  publishableKey: string;
  serviceKey: string;
  projectRef: string;
  developerIds: ReadonlySet<string>;
  key: Buffer;
};

/**
 * Developer mode configuration, or null when it must stay off: production builds, the explicit flag
 * unset, a project reference that does not match the configured Supabase URL, or any missing server
 * secret. Null disables every control without weakening ordinary authentication.
 */
export function developmentConfig(env: NodeJS.ProcessEnv = process.env): DevelopmentConfig | null {
  if (env.NODE_ENV === "production" || env.EDRA_DEV_MODE_ENABLED !== "true") return null;
  const projectRef = env.EDRA_DEV_PROJECT_REF ?? "";
  const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!/^[a-z]{20}$/.test(projectRef) || url !== `https://${projectRef}.supabase.co`) return null;
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const key = Buffer.from(env.EDRA_DEV_ACADEMY_ENCRYPTION_KEY ?? "", "base64");
  const developerIds = new Set((env.EDRA_DEV_DEVELOPER_IDS ?? "").split(",").map((id) => id.trim()).filter((id) => UUID.test(id)));
  if (!publishableKey || !serviceKey || key.length !== 32 || developerIds.size === 0) return null;
  return { url, publishableKey, serviceKey, projectRef, developerIds, key };
}
