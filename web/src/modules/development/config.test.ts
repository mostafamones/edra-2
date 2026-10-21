vi.mock("server-only", () => ({}));

import { describe, expect, it, vi } from "vitest";

import { developmentConfig } from "./config";

const ref = "abcdefghijklmnopqrst";
const uuid = "12345678-1234-4123-8123-123456789012";
const key = Buffer.alloc(32, 7).toString("base64");
const valid: NodeJS.ProcessEnv = {
  NODE_ENV: "development",
  EDRA_DEV_MODE_ENABLED: "true",
  EDRA_DEV_PROJECT_REF: ref,
  NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  EDRA_DEV_ACADEMY_ENCRYPTION_KEY: key,
  EDRA_DEV_DEVELOPER_IDS: uuid,
};
const withEnv = (patch: Partial<NodeJS.ProcessEnv>) => ({ ...valid, ...patch });

describe("developmentConfig", () => {
  it("returns null in production even when everything else is valid", () => {
    expect(developmentConfig(withEnv({ NODE_ENV: "production" }))).toBeNull();
  });

  it.each(["TRUE", "1", "", undefined])("requires EDRA_DEV_MODE_ENABLED to be exactly \"true\" (%j)", (flag) => {
    expect(developmentConfig(withEnv({ EDRA_DEV_MODE_ENABLED: flag }))).toBeNull();
  });

  it.each(["ABCDEFGHIJKLMNOPQRST", "abcdefghijklmnopqrs", "abcdefghijklmnopqrstu", "abcdefghijklmnopqrs1", undefined])("rejects an invalid project ref (%j)", (projectRef) => {
    expect(developmentConfig(withEnv({ EDRA_DEV_PROJECT_REF: projectRef }))).toBeNull();
  });

  it("rejects a project ref that does not match the Supabase URL", () => {
    expect(developmentConfig(withEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://zyxwvutsrqponmlkjihg.supabase.co" }))).toBeNull();
  });

  it("accepts a trailing slash on the Supabase URL and strips it", () => {
    expect(developmentConfig(withEnv({ NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co/` }))?.url).toBe(`https://${ref}.supabase.co`);
  });

  it("requires the publishable and service keys", () => {
    expect(developmentConfig(withEnv({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined }))).toBeNull();
    expect(developmentConfig(withEnv({ SUPABASE_SERVICE_ROLE_KEY: "" }))).toBeNull();
  });

  it.each([undefined, "", Buffer.alloc(31, 7).toString("base64"), Buffer.alloc(33, 7).toString("base64"), "not base64 at all!"])("requires a 32-byte base64 encryption key (%j)", (encryptionKey) => {
    expect(developmentConfig(withEnv({ EDRA_DEV_ACADEMY_ENCRYPTION_KEY: encryptionKey }))).toBeNull();
  });

  it("requires at least one valid lowercase developer UUID", () => {
    expect(developmentConfig(withEnv({ EDRA_DEV_DEVELOPER_IDS: undefined }))).toBeNull();
    expect(developmentConfig(withEnv({ EDRA_DEV_DEVELOPER_IDS: "not-a-uuid, 12345678-1234-4123-8123-12345678901A" }))).toBeNull();
  });

  it("returns the config and keeps only valid lowercase developer UUIDs", () => {
    const other = "87654321-4321-4321-8321-210987654321";
    const config = developmentConfig(withEnv({ EDRA_DEV_DEVELOPER_IDS: `not-a-uuid, ${uuid} ,12345678-1234-4123-8123-12345678901A,${other},` }));
    expect(config).toEqual({
      url: `https://${ref}.supabase.co`,
      publishableKey: "publishable",
      serviceKey: "service",
      projectRef: ref,
      developerIds: new Set([uuid, other]),
      key: Buffer.alloc(32, 7),
    });
  });
});
