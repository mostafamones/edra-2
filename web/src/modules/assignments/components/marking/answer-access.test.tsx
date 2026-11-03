// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Assignment } from "../../types";
const mocks = vi.hoisted(() => ({ loadAnswerAccess: vi.fn(), changeStudentAnswerAccess: vi.fn() }));
vi.mock("../../actions", () => mocks);
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ session: { user: { id: "staff" } } }), useAcademyScope: () => () => true }));
import { AnswerAccess } from "./answer-access";
const access = { hasAnswerVideos: true, qualifyingWork: true, revoked: false, history: [] };
function open(manager = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AnswerAccess assignment={{ academyId: "academy", id: "assignment" } as Assignment} recordId="record" manager={manager} /></QueryClientProvider>);
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("shows a failed authorization read and allows retry instead of silently hiding controls", async () => {
  mocks.loadAnswerAccess.mockResolvedValueOnce({ ok: false, message: "Unavailable" }).mockResolvedValue({ ok: true, data: access });
  open();
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry answer access" }));
  expect(await screen.findByRole("button", { name: "Revoke access" })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});
it("keeps revoke and restore manager-only while instructors can read the state", async () => {
  mocks.loadAnswerAccess.mockResolvedValue({ ok: true, data: access });
  open(false);
  await screen.findByText("Unlocked");
  expect(screen.queryByRole("button", { name: "Revoke access" })).toBeNull();
  expect(mocks.changeStudentAnswerAccess).not.toHaveBeenCalled();
});
it("records a reason and changes the manager action from revoke to restore", async () => {
  mocks.loadAnswerAccess.mockResolvedValue({ ok: true, data: access });
  mocks.changeStudentAnswerAccess.mockResolvedValue({ ok: true, data: { ...access, revoked: true } });
  open();
  fireEvent.click(await screen.findByRole("button", { name: "Revoke access" }));
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Invalid qualifying work" } });
  fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
  await waitFor(() => expect(mocks.changeStudentAnswerAccess).toHaveBeenCalledWith(expect.objectContaining({ academyId: "academy", recordId: "record", action: "revoke", reason: "Invalid qualifying work" })));
  expect(await screen.findByRole("button", { name: "Restore access" })).toBeTruthy();
});

it("retains the reason and request key after an uncertain transport failure", async () => {
  mocks.loadAnswerAccess.mockResolvedValue({ ok: true, data: access });
  mocks.changeStudentAnswerAccess.mockRejectedValueOnce(new Error("Network failure")).mockResolvedValue({ ok: true, data: { ...access, revoked: true } });
  open();
  fireEvent.click(await screen.findByRole("button", { name: "Revoke access" }));
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Invalid qualifying work" } });
  fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
  await screen.findByText("Could not confirm the access change. Retry with the same reason.");
  expect((screen.getByLabelText("Reason") as HTMLTextAreaElement).value).toBe("Invalid qualifying work");
  fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
  await screen.findByRole("button", { name: "Restore access" });
  expect(mocks.changeStudentAnswerAccess.mock.calls[1][0]).toEqual(mocks.changeStudentAnswerAccess.mock.calls[0][0]);
});
