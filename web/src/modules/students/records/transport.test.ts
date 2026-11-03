import { expect, it, vi } from "vitest";
import { throughTransport } from "@/modules/transport.test-support";
vi.mock("@tanstack/react-start/server-only", () => ({}));
const mocks = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock("./data", () => ({ staffContext: async () => ({ role: "owner" }), loadGroupChangePreview: mocks.preview }));
import { previewStudentGroupChange } from "./actions.server";

it("preserves an unselected group destination through transport", async () => {
  const id = "10000000-0000-4000-8000-000000000001";
  mocks.preview.mockResolvedValue({ destination: undefined, rows: [], changed: 0, unchanged: 0, problems: { missing: 0, stale: 0, archived: 0, incompatible: 0 }, program: null });
  const result = await previewStudentGroupChange({ academyId: id, academicYearId: id }, [{ id, version: 1 }]);
  expect(result.ok).toBe(true);
  const roundTrip = await throughTransport(result);
  expect(roundTrip).toEqual(result);
  if (roundTrip.ok) expect(Object.hasOwn(roundTrip.data, "destination")).toBe(true);
});
