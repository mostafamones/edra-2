// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MarksForm } from "./form";
import { StudentMarkSheet } from "./student";
import { markSnapshot, scoringBasis } from "./snapshot";
import type { MarkPart, SaveOutcome, SavePayload } from "./types";

const parts: MarkPart[] = [{ id: "part", title: "Written", position: 1, maxScore: "5", entry: "manual", questions: [{ id: "q", position: 1, maxScore: "5", choices: [] }] }];
const baseline = (score = "", version = "1", basis = scoringBasis(parts, 1)) => ({ version, basis, snapshot: markSnapshot(parts, { q: score }, "") });
const student = { recordId: "record", fullName: "Student One", studentCode: null, groupName: null };
afterEach(cleanup);

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }

function form(onSave: (payload: SavePayload) => Promise<SaveOutcome>, onDone = vi.fn(), base = baseline()) {
  return <TooltipProvider><MarksForm parts={parts} baseline={base} feedback="" onSave={onSave} onDone={onDone} /></TooltipProvider>;
}

describe("marking draft lifecycle", () => {
  it("keeps an edit made during a slow save, then saves only the later edit", async () => {
    const pending = deferred<SaveOutcome>(); const done = vi.fn();
    const save = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ ok: true, saved: true, baseline: baseline("3", "3") });
    render(form(save, done));
    fireEvent.change(screen.getByLabelText("Question 1 mark"), { target: { value: "2.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save marks" }));
    fireEvent.change(screen.getByLabelText("Question 1 mark"), { target: { value: "3" } });
    await act(async () => pending.resolve({ ok: true, saved: true, baseline: baseline("2", "2") }));
    expect(done).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Question 1 mark") as HTMLInputElement).value).toBe("3");
    fireEvent.click(screen.getByRole("button", { name: "Save marks" }));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(save.mock.calls[1][0].answers).toEqual([{ questionId: "q", value: "3" }]);
  });

  it("acknowledges equivalent decimal spelling without requiring another save", async () => {
    const done = vi.fn(); const save = vi.fn().mockResolvedValue({ ok: true, saved: true, baseline: baseline("2", "2") });
    render(form(save, done));
    fireEvent.change(screen.getByLabelText("Question 1 mark"), { target: { value: "2.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save marks" }));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Save marks" }).hasAttribute("disabled")).toBe(true);
  });

  it("retries the original immutable request after an unknown outcome while retaining newer input", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("lost response")).mockResolvedValueOnce({ ok: true, saved: true, baseline: baseline("2", "2") });
    render(form(save));
    fireEvent.change(screen.getByLabelText("Question 1 mark"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save marks" }));
    await screen.findByRole("button", { name: "Retry original save" });
    fireEvent.change(screen.getByLabelText("Question 1 mark"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Retry original save" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][0]).toBe(save.mock.calls[0][0]);
    expect((screen.getByLabelText("Question 1 mark") as HTMLInputElement).value).toBe("4");
  });

  it("preserves input and requires review after a conflicting version or scoring basis", async () => {
    const save = vi.fn(); const base = baseline(); const view = render(form(save, vi.fn(), base));
    fireEvent.change(screen.getByLabelText("Question 1 mark"), { target: { value: "2" } });
    view.rerender(form(save, vi.fn(), baseline("1", "2", scoringBasis(parts, 2))));
    expect(screen.getByText("Review changed information")).toBeTruthy();
    expect((screen.getByLabelText("Question 1 mark") as HTMLInputElement).value).toBe("2");
    expect(screen.getByRole("button", { name: "Save marks" }).hasAttribute("disabled")).toBe(true);
  });

  it.each(["close", "escape"])("guards actual sheet %s dismissal and discards only after an explicit choice", async (path) => {
    const close = vi.fn();
    render(<StudentMarkSheet student={student} onClose={close} form={() => form(vi.fn())} />);
    fireEvent.change(screen.getByLabelText("Question 1 mark"), { target: { value: "2" } });
    if (path === "close") fireEvent.click(screen.getByRole("button", { name: "Close" }));
    else fireEvent.keyDown(document, { key: "Escape" });
    await screen.findByRole("alertdialog");
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect((screen.getByLabelText("Question 1 mark") as HTMLInputElement).value).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard unsaved entries" }));
    expect(close).toHaveBeenCalledOnce();
  });
});
