// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { studentListQueryKey, studentRecordQueryKey } from "./queries";
import { DEFAULT_LIST_PARAMS } from "./list-params";
import { useStudentLabels } from "./use-labels";

const mocks = vi.hoisted(() => ({ set: vi.fn(), error: vi.fn(), current: true }));
vi.mock("./labels", () => ({ setStudentRecordsLabel: mocks.set }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("@/modules/auth", () => ({ useAcademyScope: () => () => mocks.current }));
vi.mock("@/modules/labels", () => ({ labelsQueryKey: (academy: string, domain: string) => ["labels", academy, domain] }));

const listKey = studentListQueryKey("a", DEFAULT_LIST_PARAMS);
const detailKey = studentRecordQueryKey("a", "r1");
const setup = () => {
  const cache = new QueryClient();
  cache.setQueryData(listKey, { rows: [{ id: "r1", labelIds: ["keep"] }, { id: "r2", labelIds: [] }], total: 2 });
  cache.setQueryData(detailKey, { id: "r1", labelIds: ["keep"] });
  const invalidate = vi.spyOn(cache, "invalidateQueries");
  const { result } = renderHook(() => useStudentLabels("a"), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>,
  });
  const rowLabels = () => (cache.getQueryData(listKey) as { rows: { id: string; labelIds: string[] }[] }).rows.map((row) => row.labelIds);
  return { cache, result, invalidate, rowLabels };
};

describe("student label writes", () => {
  beforeEach(() => { mocks.set.mockReset(); mocks.error.mockReset(); mocks.current = true; });

  it("shows one record's change at once, keeps other labels and refreshes list and detail", async () => {
    let answer!: (value: unknown) => void;
    mocks.set.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const { cache, result, invalidate, rowLabels } = setup();
    let write!: Promise<boolean>;
    await act(async () => { write = result.current.applyToRecord("r1", "new", true); await Promise.resolve(); await Promise.resolve(); });
    expect(rowLabels()).toEqual([["keep", "new"], []]);
    expect(cache.getQueryData<{ labelIds: string[] }>(detailKey)?.labelIds).toEqual(["keep", "new"]);
    expect(invalidate).not.toHaveBeenCalled();
    await act(async () => { answer({ ok: true, changed: 1 }); await write; });
    expect(mocks.set).toHaveBeenCalledWith({ academyId: "a", recordIds: ["r1"], labelId: "new", applied: true });
    expect(invalidate.mock.calls.map(([filter]) => filter?.queryKey)).toEqual([["students", "a", "list"], ["students", "a", "detail"]]);
  });

  it("undoes only that label when the server refuses, and refreshes the catalog for a deleted label", async () => {
    mocks.set.mockResolvedValue({ ok: false, code: "label_not_found", message: "This label was deleted." });
    const { result, invalidate, rowLabels } = setup();
    await act(async () => { await result.current.applyToRecord("r1", "new", true); });
    expect(rowLabels()).toEqual([["keep"], []]);
    expect(mocks.error).toHaveBeenCalledWith("This label was deleted.");
    expect(invalidate.mock.calls.some(([filter]) => filter?.queryKey?.[0] === "labels")).toBe(true);
  });

  it("shows a bulk write at once and keeps it when the server accepts it", async () => {
    let answer!: (value: unknown) => void;
    mocks.set.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    const { result, rowLabels } = setup();
    let write!: Promise<boolean>;
    await act(async () => { write = result.current.applyToSelection(["r1", "r2"], "new", true); await Promise.resolve(); await Promise.resolve(); });
    expect(rowLabels()).toEqual([["keep", "new"], ["new"]]);
    let ok = false;
    await act(async () => { answer({ ok: true, changed: 2 }); ok = await write; });
    expect(ok).toBe(true);
    expect(rowLabels()).toEqual([["keep", "new"], ["new"]]);
  });

  it("undoes a refused bulk write only where it changed something", async () => {
    mocks.set.mockResolvedValueOnce({ ok: false, code: "not_found", message: "Gone" });
    const { result, rowLabels } = setup();
    let ok = true;
    // r1 already has "keep": a failed apply must not take it away.
    await act(async () => { ok = await result.current.applyToSelection(["r1", "r2"], "keep", true); });
    expect(ok).toBe(false);
    expect(rowLabels()).toEqual([["keep"], []]);
    expect(mocks.error).toHaveBeenCalledWith("Gone");
  });

  it("removes one label from a mixed selection without touching the others", async () => {
    mocks.set.mockResolvedValue({ ok: true, changed: 1 });
    const { result, rowLabels } = setup();
    await act(async () => { await result.current.applyToSelection(["r1", "r2"], "keep", false); });
    expect(rowLabels()).toEqual([[], []]);
    expect(mocks.set).toHaveBeenCalledWith({ academyId: "a", recordIds: ["r1", "r2"], labelId: "keep", applied: false });
  });

  it("never runs two writes of one record and label together", async () => {
    let answer!: (value: unknown) => void;
    mocks.set.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    const { result } = setup();
    let first!: Promise<boolean>;
    await act(async () => { first = result.current.applyToRecord("r1", "new", true); await Promise.resolve(); });
    let second = true;
    await act(async () => { second = await result.current.applyToSelection(["r1", "r2"], "new", false); });
    expect(second).toBe(false);
    expect(mocks.set).toHaveBeenCalledTimes(1);
    expect(mocks.error).toHaveBeenCalledOnce();
    await act(async () => { answer({ ok: true, changed: 1 }); await first; });
  });

  it("stays silent when the academy changed before a late failure", async () => {
    let answer!: (value: unknown) => void;
    mocks.set.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const { result } = setup();
    let write!: Promise<boolean>;
    await act(async () => { write = result.current.applyToSelection(["r1"], "new", true); await Promise.resolve(); });
    mocks.current = false;
    let ok = true;
    await act(async () => { answer({ ok: false, code: "unavailable", message: "Down" }); ok = await write; });
    expect(ok).toBe(false);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("refreshes records after a confirmed deletion, not after a rename or recolor", () => {
    const { result, invalidate } = setup();
    const { onChanged, onLabelChange } = result.current.definitionChanges;
    onLabelChange("l", { id: "l", name: "Renamed", color: "red" });
    onChanged();
    expect(invalidate).not.toHaveBeenCalled();
    onLabelChange("l", null);
    onChanged();
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});
