// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { studentRecordQueryKey } from "../queries";
import { SuspensionDialog, type SuspensionRequest } from "./suspension-dialog";

const mocks = vi.hoisted(() => ({ preview: vi.fn(), set: vi.fn(), success: vi.fn(), warning: vi.fn(), current: true }));
vi.mock("../suspension", () => ({ previewStudentSuspension: mocks.preview, setStudentSuspension: mocks.set }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, warning: mocks.warning, error: vi.fn() } }));
vi.mock("@/modules/auth", () => ({ useAcademyScope: () => () => mocks.current }));

const previewRow = (recordId: string, suspended: boolean, revision: number, archived = false) =>
  ({ recordId, profileId: `p-${recordId}`, fullName: recordId, archived, yearClosed: false, connected: false, suspended, revision });

function show(request: SuspensionRequest, cache = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const onClose = vi.fn();
  const onDone = vi.fn();
  render(<QueryClientProvider client={cache}><SuspensionDialog academyId="a" request={request} onClose={onClose} onDone={onDone} /></QueryClientProvider>);
  return { onClose, onDone, cache };
}
const confirm = () => screen.getByRole("button", { name: /online access$/ });

describe("suspension confirmation", () => {
  beforeEach(() => { for (const mock of [mocks.preview, mocks.set, mocks.success, mocks.warning]) mock.mockReset(); mocks.current = true; });
  afterEach(cleanup);

  it("reviews fresh state for a mixed selection before it can be confirmed", async () => {
    mocks.preview.mockResolvedValue({ ok: true, data: [previewRow("r1", false, 0), previewRow("r2", true, 3)] });
    show({ suspend: true, recordIds: ["r1", "r2"] });
    expect((confirm() as HTMLButtonElement).disabled).toBe(true);
    expect(await screen.findByText("1 will change · 1 already suspended")).toBeTruthy();
    expect((confirm() as HTMLButtonElement).disabled).toBe(false);
    expect(mocks.preview).toHaveBeenCalledWith({ academyId: "a", recordIds: ["r1", "r2"] });
  });

  it("says when restoring leaves archival suspension in place", async () => {
    mocks.preview.mockResolvedValue({ ok: true, data: [previewRow("r1", true, 1, true)] });
    show({ suspend: false, recordIds: ["r1"], name: "Amal" });
    expect(await screen.findByText("1 archived: online access stays suspended until restored")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Restore online access for Amal?" })).toBeTruthy();
  });

  it("blocks a selection with missing records", async () => {
    mocks.preview.mockResolvedValue({ ok: true, data: [previewRow("r1", false, 0)] });
    show({ suspend: true, recordIds: ["r1", "gone"] });
    expect(await screen.findByText("1 student no longer exist. Close and reselect.")).toBeTruthy();
    expect((confirm() as HTMLButtonElement).disabled).toBe(true);
  });

  it("on stale state keeps the reason, refreshes the review and waits for a new confirmation", async () => {
    mocks.preview.mockResolvedValueOnce({ ok: true, data: [previewRow("r1", false, 0)] })
      .mockResolvedValueOnce({ ok: true, data: [previewRow("r1", false, 2)] });
    mocks.set.mockResolvedValueOnce({ ok: false, code: "stale_suspension", message: "Changed since review." })
      .mockResolvedValueOnce({ ok: true, data: { changed: [{ recordId: "r1", profileId: "p", revision: 3 }], unchanged: [] } });
    const { onDone, onClose } = show({ suspend: true, recordIds: ["r1"], name: "Amal" });
    await screen.findByText("1 will change");
    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "Unpaid" } });
    fireEvent.click(confirm());
    expect((await screen.findByRole("alert")).textContent).toBe("Changed since review.");
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(2));
    expect((screen.getByLabelText("Reason (optional)") as HTMLTextAreaElement).value).toBe("Unpaid");
    expect(mocks.set).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    await waitFor(() => expect((confirm() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(confirm());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mocks.set).toHaveBeenLastCalledWith({ academyId: "a", records: [{ id: "r1", revision: 2 }], suspended: true, reason: "Unpaid" });
    expect(onClose).toHaveBeenCalled();
  });

  it("reports unchanged targets and refreshes every annual record of the academy", async () => {
    mocks.preview.mockResolvedValue({ ok: true, data: [previewRow("r1", false, 0), previewRow("r2", true, 1)] });
    mocks.set.mockResolvedValue({ ok: true, data: { changed: [{ recordId: "r1", profileId: "p", revision: 1 }], unchanged: [{ recordId: "r2", profileId: "q", revision: 1 }] } });
    const cache = new QueryClient();
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    show({ suspend: true, recordIds: ["r1", "r2"] }, cache);
    await screen.findByText(/1 will change/);
    fireEvent.click(confirm());
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Suspended online access for 1 student; 1 unchanged."));
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([["students", "a"], ["learning"], ["content-access"]]);
  });

  it("keeps an acknowledged change when the refresh fails and retries only the refresh", async () => {
    mocks.preview.mockResolvedValue({ ok: true, data: [previewRow("r1", false, 0)] });
    mocks.set.mockResolvedValue({ ok: true, data: { changed: [{ recordId: "r1", profileId: "p", revision: 1 }], unchanged: [] } });
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // A student detail on screen whose refresh fails.
    const unwatch = new QueryObserver(cache, { queryKey: studentRecordQueryKey("a", "r1"), queryFn: () => Promise.reject(new Error("offline")) }).subscribe(() => {});
    const { onDone } = show({ suspend: true, recordIds: ["r1"], name: "Amal" }, cache);
    await screen.findByText("1 will change");
    fireEvent.click(confirm());
    await waitFor(() => expect(mocks.warning).toHaveBeenCalled());
    expect(onDone).toHaveBeenCalledTimes(1);
    const [message, options] = mocks.warning.mock.calls[0];
    expect(message).toBe("Suspended online access for Amal. Couldn’t refresh students.");
    options.action.onClick();
    expect(mocks.set).toHaveBeenCalledTimes(1);
    unwatch();
  });

  it("ignores a late answer after the academy changed", async () => {
    mocks.preview.mockResolvedValue({ ok: true, data: [previewRow("r1", false, 0)] });
    let answer!: (value: unknown) => void;
    mocks.set.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const { onDone } = show({ suspend: true, recordIds: ["r1"] });
    await screen.findByText("1 will change");
    fireEvent.click(confirm());
    mocks.current = false;
    answer({ ok: true, data: { changed: [{ recordId: "r1", profileId: "p", revision: 1 }], unchanged: [] } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onDone).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
