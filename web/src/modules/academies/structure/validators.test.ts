import { expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (schema: { parse: (value: unknown) => unknown }) => ({
      handler: (handler: (input: { data: unknown }) => unknown) =>
        ({ data }: { data: unknown }) => handler({ data: schema.parse(data) }),
    }),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { loadStructure, previewStructureChange } from "./actions";

it("preserves structured results for malformed slugs", async () => {
  const bad = 42 as unknown as string;
  expect(await loadStructure(bad)).toEqual({ ok: true, value: null });
  expect(await previewStructureChange(bad, { operation: "add_level", levelId: "secondary-2" })).toMatchObject({ ok: false, code: "forbidden" });
});
