import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LIST_PARAMS } from "./list-params";

const mocks = vi.hoisted(() => ({ member: vi.fn() }));
vi.mock("@/lib/supabase/membership", () => ({ academyMember: mocks.member }));
vi.mock("@/lib/supabase/paginate", () => ({ fetchAllPages: vi.fn() }));
vi.mock("@/lib/supabase/authority", () => ({}));

import { getStudentRecord, listStudentRecords } from "./data";

const ACADEMY = "11111111-1111-4111-8111-111111111111";
const RECORD = "22222222-2222-4222-8222-222222222222";
const LABEL = "33333333-3333-4333-8333-333333333333";
const row = {
  id: RECORD, academy_student_profile_id: "p", full_name: "Name", student_phone: "+201012345678", parent_phone: "+201112223333",
  level_id: "l", level_name: "L", track_id: null, track_name: null, primary_group_id: null, group_name: null, participation_type: "in_person",
  archived_at: null, created_at: "x", updated_at: "x", version: 3, online_account: "not_connected", account_name: null, label_ids: [LABEL],
};

/** A query builder resolving to `result` however it is chained. */
const chain = (result: unknown) => {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is"]) builder[method] = () => builder;
  builder.maybeSingle = () => Promise.resolve(result);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
};

describe("student record reads", () => {
  beforeEach(() => mocks.member.mockReset());

  it("sends label filters to the database, keeping its matching total and the year total", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { rows: [row], total: 41 }, error: null });
    const from = vi.fn((table: string) => table === "academic_years"
      ? chain({ data: { id: "year" }, error: null })
      : chain({ count: 300, error: null }));
    mocks.member.mockResolvedValue({ db: { rpc, from }, userId: "u", role: "instructor" });
    const result = await listStudentRecords(ACADEMY, { ...DEFAULT_LIST_PARAMS, labels: [LABEL], pageIndex: 2 });
    expect(rpc).toHaveBeenCalledWith("list_student_records", expect.objectContaining({ p_label_ids: [LABEL], p_unlabeled: false, p_page_index: 2 }));
    expect(result).toMatchObject({ ok: true, data: { total: 41, yearTotal: 300, rows: [{ id: RECORD, labelIds: [LABEL] }] } });
    await listStudentRecords(ACADEMY, { ...DEFAULT_LIST_PARAMS, unlabeled: true });
    expect(rpc).toHaveBeenLastCalledWith("list_student_records", expect.objectContaining({ p_label_ids: [], p_unlabeled: true }));
  });

  it("reads one record's labels, with no filter on its year or archive state", async () => {
    const eq = vi.fn();
    const from = vi.fn((table: string) => {
      const data = table === "annual_student_records"
        ? { id: RECORD, academy_id: ACADEMY, academic_year_id: "closed-year", academy_student_profile_id: "p", archived_at: "2030-01-01", version: 3 }
        : table === "annual_student_record_labels" ? [{ label_id: LABEL }] : { user_id: null, access_suspended_at: null };
      const builder = chain({ data, error: null });
      if (table === "annual_student_record_labels") { const inner = builder.eq; builder.eq = (...args: unknown[]) => { eq(...args); return (inner as () => unknown)(); }; }
      return builder;
    });
    mocks.member.mockResolvedValue({ db: { from }, userId: "u", role: "instructor" });
    const result = await getStudentRecord(ACADEMY, RECORD);
    expect(result).toMatchObject({ ok: true, data: { labelIds: [LABEL], version: 3 } });
    expect(eq.mock.calls).toEqual([["academy_id", ACADEMY], ["annual_student_record_id", RECORD]]);
  });
});
