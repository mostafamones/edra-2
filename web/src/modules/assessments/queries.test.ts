import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

import { DEFAULT_PARAMS } from "./params";
import { DEFAULT_STATUSES } from "./types";
import { loadAssessments, toAssessmentPage, type ListFilters } from "./queries";

const row = (type: string, id: string, status: string, extra: Record<string, unknown> = {}) => ({
  type, id, status, title: id, academic_year_id: "year", audience: "level", level_id: "preparatory-3", track_id: null, group_ids: [],
  max_score: "10", marked_count: 2, audience_count: 7, created_at: "2026-10-01T10:00:00Z", due_at: null, opens_at: null, closes_at: null, processing_pending: false, parts: [], labels: [], ...extra,
});
const filters: ListFilters = { type: DEFAULT_PARAMS.type, search: " unit ", year: "year", audience: "all", level: null, track: null, groupId: null, statuses: [...DEFAULT_STATUSES], labels: [], unlabeled: false, sort: "newest", group: "none", pageSize: 24 };

beforeEach(() => rpc.mockReset());

describe("combined assessment page", () => {
  it("keeps the database order and each type's own status and dates", () => {
    const page = toAssessmentPage({ total: 30, server_now: "now", items: [
      row("exam", "e1", "headroom", { opens_at: "2026-10-01T08:00:00Z", closes_at: "2026-10-01T09:00:00Z", processing_pending: true }),
      row("assignment", "a1", "closed", { due_at: "2026-10-02T08:00:00Z", parts: [{ title: "Old", kind: null }] }),
      row("quiz", "q1", "closed"),
    ] });
    expect(page.total).toBe(30);
    expect(page.items.map((item) => `${item.type}:${item.id}:${item.status}`)).toEqual(["exam:e1:headroom", "assignment:a1:closed", "quiz:q1:closed"]);
    expect(page.items[0]).toMatchObject({ opensAt: "2026-10-01T08:00:00Z", closesAt: "2026-10-01T09:00:00Z", processingPending: true });
    expect(page.items[1]).toMatchObject({ dueAt: "2026-10-02T08:00:00Z", markedCount: 2, audienceCount: 7 });
    expect(page.items[1]).not.toHaveProperty("opensAt");
    expect(page.items[1].parts).toEqual([{ title: "Old", kind: null }]);
    // A part kind from another type fails the page.
    expect(() => toAssessmentPage({ total: 1, items: [row("quiz", "q1", "open", { parts: [{ title: "A", kind: "file_upload" }] })] })).toThrow();
  });

  it("maps each row's labels, showing a color key removed from the palette as gray", () => {
    const labels = [{ id: "l1", name: "Revision", color: "teal" }, { id: "l2", name: "Old", color: "magenta" }];
    expect(toAssessmentPage({ total: 1, items: [row("quiz", "q1", "open", { labels })] }).items[0].labels)
      .toEqual([{ id: "l1", name: "Revision", color: "teal" }, { id: "l2", name: "Old", color: "gray" }]);
  });

  it("rejects the whole page when one row is not a known type status, rather than showing a partial list", () => {
    expect(() => toAssessmentPage({ total: 2, items: [row("quiz", "q1", "open"), row("assignment", "a1", "open")] })).toThrow();
    expect(() => toAssessmentPage({ total: 1, items: [row("homework", "h1", "active")] })).toThrow();
  });

  it("asks for one page of the combined order with the applied filters", async () => {
    rpc.mockResolvedValue({ data: { total: 0, items: [], server_now: "now" }, error: null });
    await loadAssessments("academy", filters, 2);
    expect(rpc).toHaveBeenCalledWith("list_assessments", {
      p_academy_id: "academy", p_academic_year_id: "year", p_types: ["assignment", "quiz", "exam"], p_search: "unit", p_audience: null, p_level_id: null, p_track_id: null, p_group_id: null,
      p_statuses: [...DEFAULT_STATUSES], p_label_ids: [], p_unlabeled: false, p_sort: "newest", p_group: "none", p_limit: 24, p_offset: 48,
    });
    await loadAssessments("academy", { ...filters, type: "exam", year: "all", audience: "groups", statuses: ["exam:archived"], sort: "title", group: "status" }, 0);
    expect(rpc).toHaveBeenLastCalledWith("list_assessments", expect.objectContaining({
      p_academic_year_id: null, p_types: ["exam"], p_audience: "groups", p_statuses: ["exam:archived"], p_sort: "title", p_group: "status", p_offset: 0,
    }));
    await loadAssessments("academy", { ...filters, labels: ["l1", "l2"] }, 0);
    expect(rpc).toHaveBeenLastCalledWith("list_assessments", expect.objectContaining({ p_label_ids: ["l1", "l2"], p_unlabeled: false }));
    await loadAssessments("academy", { ...filters, unlabeled: true }, 0);
    expect(rpc).toHaveBeenLastCalledWith("list_assessments", expect.objectContaining({ p_label_ids: [], p_unlabeled: true }));
    await loadAssessments("academy", { ...filters, pageSize: 48 }, 2);
    expect(rpc).toHaveBeenLastCalledWith("list_assessments", expect.objectContaining({ p_limit: 48, p_offset: 96 }));
  });

  it("fails instead of returning an empty list when the read fails or is refused", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(loadAssessments("academy", filters, 0)).rejects.toThrow("boom");
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(loadAssessments("academy", filters, 0)).rejects.toThrow("forbidden");
  });
});
