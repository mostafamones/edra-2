import { describe, expect, it, vi } from "vitest";

const RFC_ACADEMY_ID = "0b9c3c1e-8f7a-4b5e-9a2d-1c3e5f7a9b0d";
// Synthetic development IDs are deterministic hashes: valid Postgres UUIDs without an RFC version/variant.
const DEV_ACADEMY_ID = "02bf25b2-49df-e305-2d71-7590c36ca312";
const row = (academyId: string, role: string, name: string) => ({ academy_id: academyId, role, academies: { name, slug: name.toLowerCase(), icon: "school" } });
let rows: unknown[] = [];
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ is: async () => ({ data: rows, error: null }) }) }) }),
}) }));
import { listUserAcademies } from "./queries";

describe("academy switcher memberships", () => {
  it("lists academies with RFC and synthetic development IDs", async () => {
    rows = [row(RFC_ACADEMY_ID, "owner", "Magd"), row(DEV_ACADEMY_ID, "instructor", "Dev")];
    expect(await listUserAcademies("user")).toEqual([
      { id: RFC_ACADEMY_ID, name: "Magd", slug: "magd", icon: "school", role: "owner" },
      { id: DEV_ACADEMY_ID, name: "Dev", slug: "dev", icon: "school", role: "instructor" },
    ]);
  });

  it.each(["not-a-uuid", "02bf25b2-49df-e305-2d71-7590c36ca31", "02bf25b2-49df-e305-2d71-7590c36ca31z", "02bf25b249dfe3052d717590c36ca312"])(
    "rejects a malformed academy ID %s",
    async (id) => {
      rows = [row(id, "owner", "Bad")];
      await expect(listUserAcademies("user")).rejects.toThrow();
    },
  );
});
