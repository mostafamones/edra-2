import { expect, it, vi } from "vitest";
import { throughTransport } from "@/modules/transport.test-support";

vi.mock("@tanstack/react-start/server-only", () => ({}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: "staff" } } }) }, rpc }),
}));

import { processStudentImportBatch, stageStudentImportRows } from "./actions.server";

it("transports staged rows and real batch success and failure results", async () => {
  const id = "10000000-0000-4000-8000-000000000001";
  const rows = [{ ordinal: 1, sourceRow: 2, values: { full_name: "Example", student_phone: null } }];
  rpc.mockResolvedValueOnce({ data: 1, error: null });
  const staged = await stageStudentImportRows(id, await throughTransport(rows));
  expect(await throughTransport(staged)).toEqual({ ok: true, data: { staged: 1 } });
  rpc.mockResolvedValueOnce({ data: { state: "importing", blocked_reason: null, created: 1, skipped: 0, failed: 0, pending: 1, next_batch: 1 }, error: null });
  const batch = await processStudentImportBatch(id, 0);
  expect(await throughTransport(batch)).toEqual(batch);
  expect(batch.ok).toBe(true);
  const failure = await processStudentImportBatch(id, -1);
  expect(await throughTransport(failure)).toEqual(failure);
  expect(failure).toMatchObject({ ok: false, code: "validation" });
});
