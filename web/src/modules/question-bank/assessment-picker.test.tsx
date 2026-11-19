// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { AssessmentQuestionPicker } from "./assessment-picker";
import type { BankPayload } from "./bank-contract";
import type { SavedBank } from "./saved-bank";

const state = vi.hoisted(() => ({ current: true, upload: vi.fn(), close: vi.fn(), question: null as BankPayload | null }));
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "staff" } }), useAcademyScope: () => () => state.current }));
vi.mock("@/components/shared/assessment/images/context", () => ({ useImages: () => ({ upload: state.upload }) }));
vi.mock("./saved-bank", () => ({
  SavedBank: ({ onPick }: ComponentProps<typeof SavedBank>) => onPick?.(state.question!, state.close),
}));

afterEach(() => { cleanup(); vi.resetAllMocks(); state.current = true; });
const question: BankPayload = {
  prompt: "Read the graph.", topic: null, section: null, printedNumber: "1",
  source: { file: "book.pdf", page: 2, continuationPages: [] }, choices: [{ key: "a", text: "First" }, { key: "b", text: "Second" }],
  answer: "b", visuals: [{ description: "Graph", page: 2, bounds: { top: 0, bottom: 1, left: 0, right: 1 }, image: "data:image/jpeg;base64,/9j/" }],
};
function picker(append: ComponentProps<typeof AssessmentQuestionPicker>["append"], kind = "question_sheet") {
  return <AssessmentQuestionPicker academyId="academy" academySlug="test" kind={kind} full={false} append={append} maxChoices={4} />;
}

it("copies the confirmed key and uploads the figure before appending the draft", async () => {
  state.question = question;
  let finish!: (ok: boolean) => void;
  const id = "12345678-1234-1234-1234-123456789abc";
  state.upload.mockReturnValue({ id, done: new Promise<boolean>(resolve => { finish = resolve; }) });
  const append = vi.fn(() => true);
  render(picker(append));
  fireEvent.click(screen.getByRole("button", { name: "Add to part" }));
  expect(append).not.toHaveBeenCalled();
  finish(true);
  await waitFor(() => expect(append).toHaveBeenCalledExactlyOnceWith({
    prompt: `Read the graph.\n{{image:${id}}}`, maxScore: "1", modelAnswer: "",
    choices: [{ label: "First", isCorrect: false }, { label: "Second", isCorrect: true }],
  }));
  expect(state.close).toHaveBeenCalledOnce();
});

it("keeps the part unchanged on an incompatible selection or a failed figure upload", async () => {
  state.question = question;
  state.upload.mockReturnValue({ id: "figure", done: Promise.resolve(false) });
  const append = vi.fn(() => true);
  const view = render(picker(append, "written_work"));
  expect((screen.getByRole("button", { name: "Add to part" }) as HTMLButtonElement).disabled).toBe(true);
  expect(state.upload).not.toHaveBeenCalled();
  view.rerender(picker(append));
  fireEvent.click(screen.getByRole("button", { name: "Add to part" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(append).not.toHaveBeenCalled();
});
