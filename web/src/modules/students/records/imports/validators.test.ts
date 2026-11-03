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

import { processStudentImportBatch, startStudentImport } from "./actions";

it("returns the import validation failure for a non-number row count", async () => {
  const id = "10000000-0000-4000-8000-000000000001";
  const scope = { academyId: id, academicYearId: id };
  const source = { fileName: "students.csv", format: "csv" as const, worksheet: null, defaults: { levelId: "", trackId: "", primaryGroupId: "", participationType: "" as const }, replaces: null };
  expect(await startStudentImport(scope, source, "bad" as unknown as number)).toMatchObject({ ok: false, code: "validation" });
});

it("returns the import validation failure for a non-number batch index", async () => {
  expect(await processStudentImportBatch("10000000-0000-4000-8000-000000000001", "bad" as unknown as number)).toMatchObject({ ok: false, code: "validation" });
});
