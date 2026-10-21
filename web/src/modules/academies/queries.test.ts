import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Synthetic development IDs are deterministic hashes: valid Postgres UUIDs without an RFC version/variant.
const DEV_ACADEMY_ID = "02bf25b2-49df-e305-2d71-7590c36ca312";
const rows = [{ academy_id: DEV_ACADEMY_ID, role: "instructor", academies: { name: "Edra Dev Academy", slug: "edra-dev-be8db1dc", icon: "school" } }];
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ is: async () => ({ data: rows, error: null }) }) }) }),
}) }));
import { listUserAcademies } from "./queries";

describe("academy switcher memberships", () => {
  it("lists an academy whose ID is a non-RFC Postgres UUID", async () => {
    expect(await listUserAcademies("user")).toEqual([{ id: DEV_ACADEMY_ID, name: "Edra Dev Academy", slug: "edra-dev-be8db1dc", icon: "school", role: "instructor" }]);
  });

  it("no application schema uses Zod's RFC-only z.uuid()", () => {
    const src = join(__dirname, "../..");
    const offenders = readdirSync(src, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file) && !file.endsWith("queries.test.ts"))
      .filter((file) => readFileSync(join(src, file), "utf8").includes("z.uuid("));
    expect(offenders).toEqual([]);
  });
});
