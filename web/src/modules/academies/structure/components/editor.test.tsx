// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ preview: vi.fn(), change: vi.fn(), current: true }));
vi.mock("../actions", () => ({ previewStructureChange: api.preview, changeStructure: api.change }));
vi.mock("@/modules/auth", () => ({
  useAuth: () => ({ user: { id: "12900000-0000-4000-8000-000000000002" } }),
  useAcademyScope: () => () => api.current,
}));
import { OfferingEditor } from "./editor";

const academyId = "12900000-0000-4000-8000-000000000001";
const accountId = "12900000-0000-4000-8000-000000000002";
const initial = { operation: "add_track" as const, levelId: "secondary-2" as const, name: "Scientific" };
const structure = { academyId, accountId, canManage: true, transitionsEnabled: false, revision: 1, levels: [] };
const preview = { change: initial, revision: 1, fingerprint: "a".repeat(32), changes: {}, blockers: {}, dependencies: {}, academicYearId: null };
const saved = { ok: true, value: { outcome: "committed", structure: { ...structure, revision: 2 }, replayed: false, trackId: null } };

beforeEach(() => {
  api.current = true;
  api.preview.mockReset().mockResolvedValue({ ok: true, value: preview });
  api.change.mockReset();
});
afterEach(cleanup);

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const committed = vi.fn();
  render(<QueryClientProvider client={client}><OfferingEditor slug="academy-a" accountId={accountId} academyId={academyId}
    structure={structure} initial={initial} onClose={vi.fn()} onCommitted={committed} /></QueryClientProvider>);
  return { client, committed };
}

describe("offering editor request lifecycle", () => {
  it("retries an uncertain save with exactly the same request and key", async () => {
    api.change.mockRejectedValueOnce(new Error("lost response")).mockResolvedValueOnce(saved);
    const { committed } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("The save outcome is unknown. Retry to check the same request.");
    expect(screen.getByLabelText("Track name").matches(":disabled")).toBe(true);
    await waitFor(() => expect((screen.getByRole("button", { name: "Retry save" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(committed).toHaveBeenCalledOnce());
    expect(api.preview).toHaveBeenCalledOnce();
    expect(api.change.mock.calls[1]).toEqual(api.change.mock.calls[0]);
  });
  it("preserves the draft on conflict and waits for another explicit save", async () => {
    api.change.mockResolvedValue({ ok: true, value: { outcome: "conflict", preview: { ...preview, revision: 2 } } });
    mount();
    fireEvent.change(screen.getByLabelText("Track name"), { target: { value: "Literature" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/The structure or its records changed/);
    expect((screen.getByLabelText("Track name") as HTMLInputElement).value).toBe("Literature");
    expect(api.preview).toHaveBeenCalledOnce();
    expect(api.change).toHaveBeenCalledOnce();
    expect((screen.getByLabelText("Track name") as HTMLInputElement).disabled).toBe(false);
  });
  it("refreshes only captured-academy caches and suppresses late local success after a switch", async () => {
    let finish!: (value: typeof saved) => void;
    api.change.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const { client, committed } = mount();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.change).toHaveBeenCalledOnce());
    api.current = false;
    await act(async () => finish(saved));
    expect(committed).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalled();
    for (const [filter] of invalidate.mock.calls) expect(filter?.queryKey).toContain(academyId);
  });
  it("keeps a committed operation successful when cache refresh fails", async () => {
    api.change.mockResolvedValue(saved);
    const { client, committed } = mount();
    vi.spyOn(client, "invalidateQueries").mockRejectedValue(new Error("refresh failed"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(committed).toHaveBeenCalledOnce());
    expect(screen.queryByText(/save outcome is unknown/)).toBeNull();
  });
});
