// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScoringCorrection } from "./correction";
const question = { id: "q", number: 1, excluded: false, choices: [{ id: "a", position: 1, label: "One", isCorrect: true }, { id: "b", position: 2, label: "Two", isCorrect: false }] };
afterEach(cleanup);

describe("scoring correction review", () => {
  it("retains a selection across refresh, requiring explicit review before binding a new revision", async () => {
    const run = vi.fn().mockResolvedValue({ ok: true }); const close = vi.fn(); const refresh = vi.fn();
    const props = { question, mode: "key" as const, revision: 1, run, refresh, onClose: close, current: () => true };
    const view = render(<ScoringCorrection {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: "B. Two" }));
    view.rerender(<ScoringCorrection {...props} revision={2} />);
    expect(screen.getByRole("radio", { name: "B. Two" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("button", { name: "Correct key" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Review latest scoring basis" }));
    fireEvent.click(screen.getByRole("button", { name: "Correct key" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(run.mock.calls[0][0]).toMatchObject({ choiceId: "b", expectedScoringRevision: 2 });
  });
  it("retries the same correction receipt identity after an unknown outcome, even if a refresh advances revision", async () => {
    const run = vi.fn().mockResolvedValueOnce({ ok: false, code: "unavailable", message: "Unknown" }).mockResolvedValueOnce({ ok: true });
    const close = vi.fn(); const refresh = vi.fn(); const props = { question, mode: "key" as const, revision: 1, run, refresh, onClose: close, current: () => true };
    const view = render(<ScoringCorrection {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: "B. Two" }));
    fireEvent.click(screen.getByRole("button", { name: "Correct key" }));
    await screen.findByRole("button", { name: "Retry original correction" });
    view.rerender(<ScoringCorrection {...props} revision={2} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry original correction" })));
    expect(run.mock.calls[1][0]).toBe(run.mock.calls[0][0]);
    expect(run.mock.calls[1][0].expectedScoringRevision).toBe(1);
  });
});
