// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({ claim: vi.fn(), renew: vi.fn(), read: vi.fn(), save: vi.fn(), submit: vi.fn(), start: vi.fn(), finish: vi.fn(), remove: vi.fn(), upload: vi.fn(), refresh: vi.fn() }));
vi.mock("../actions", () => ({ claimAssignmentEditor: api.claim, renewAssignmentEditor: api.renew, readAssignmentEditor: api.read, saveAssignmentAnswers: api.save, submitAssignment: api.submit, startAssignmentUpload: api.start, finishAssignmentUpload: api.finish, removeAssignmentFile: api.remove, signAssignmentImages: vi.fn() }));
vi.mock("../upload", () => ({ uploadToSignedUrl: api.upload }));
vi.mock("@/lib/navigation", () => ({ useRouter: () => ({ refresh: api.refresh }) }));
vi.mock("./part", () => ({ StudentAssignmentPart: ({ onChoose }: { onChoose: (q: string, a: string) => void }) => <button onClick={() => onChoose("q", "answer")}>Choose</button> }));
vi.mock("./submit", () => ({ StudentAssignmentSubmit: ({ onSubmit }: { onSubmit: () => Promise<string | null> }) => <button onClick={() => void onSubmit()}>Submit</button> }));
import { StudentAssignmentEditor } from "./editor";
import type { EditorDocument } from "../types";

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const doc = { recordId: "record", generation: 1, version: 1, answers: {}, leaseUntil: "later", scoringRevision: 1,
  parts: [{ id: "file", kind: "file_upload" as const, title: "Files", instructions: "", questions: [] }, { id: "questions", kind: "online_questions" as const, title: "Questions", instructions: "", questions: [] }], files: [] as EditorDocument["files"] };
const props = { academyId: "academy", assignmentId: "assignment", userId: "user", dueAt: null };
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); });

it("orders document calls while uploads overlap and preserves finished files on save acknowledgement", async () => {
  const uploads = [deferred<boolean>(), deferred<boolean>()];
  const finish = deferred<{ ok: true; data: typeof doc & { files: { id: string; partId: string; name: string; size: number; mime: string; state: "complete" }[] } }>();
  const save = deferred<{ ok: true; data: { version: number } }>();
  api.claim.mockResolvedValue({ ok: true, data: doc });
  api.start.mockResolvedValueOnce({ ok: true, data: { url: "one", fileId: "one" } }).mockResolvedValueOnce({ ok: true, data: { url: "two", fileId: "two" } });
  api.upload.mockReturnValueOnce(uploads[0].promise).mockReturnValueOnce(uploads[1].promise);
  api.finish.mockReturnValue(finish.promise); api.save.mockReturnValue(save.promise);
  render(<StudentAssignmentEditor {...props} />);
  await screen.findByRole("button", { name: /Add files/ });
  const input = document.querySelector('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [new File(["a"], "one.pdf", { type: "application/pdf" }), new File(["b"], "two.pdf", { type: "application/pdf" })] } });
  await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(2));
  await act(async () => uploads[0].resolve(true));
  await waitFor(() => expect(api.finish).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: /Next part/ }));
  fireEvent.click(screen.getByRole("button", { name: "Choose" }));
  await new Promise((resolve) => setTimeout(resolve, 700));
  expect(api.save).not.toHaveBeenCalled();
  await act(async () => finish.resolve({ ok: true, data: { ...doc, files: [{ id: "one", partId: "file", name: "one.pdf", size: 1, mime: "application/pdf", state: "complete" }] } }));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  await act(async () => save.resolve({ ok: true, data: { version: 2 } }));
  fireEvent.click(screen.getByRole("button", { name: /Previous part/ }));
  expect(screen.getByText("one.pdf")).toBeTruthy();
});

it("does not refresh or write a draft when submit completes after unmount", async () => {
  const submit = deferred<{ ok: true; data: object }>();
  api.claim.mockResolvedValue({ ok: true, data: doc }); api.submit.mockReturnValue(submit.promise);
  const view = render(<StudentAssignmentEditor {...props} />);
  await screen.findByRole("button", { name: "Submit" });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  await waitFor(() => expect(api.submit).toHaveBeenCalledTimes(1));
  view.unmount();
  const set = vi.spyOn(Storage.prototype, "setItem"); const remove = vi.spyOn(Storage.prototype, "removeItem");
  await act(async () => submit.resolve({ ok: true, data: {} }));
  expect(api.refresh).not.toHaveBeenCalled(); expect(set).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
  set.mockRestore(); remove.mockRestore();
});
