// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { listQuestionBank, loadQuestionBankCollections, readQuestionBank, setQuestionBankMembership } from "./bank";
import type { BankCollections, BankPage } from "./bank-contract";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QuestionLibraryPage } from "./library";

vi.mock("./bank", () => ({
  listQuestionBank: vi.fn(), loadQuestionBankCollections: vi.fn(), readQuestionBank: vi.fn(), setQuestionBankMembership: vi.fn(),
  createQuestionBankCollection: vi.fn(), renameQuestionBankCollection: vi.fn(),
}));
vi.mock("@/modules/auth", () => ({ useAcademyScope: () => () => true }));
vi.mock("@/lib/routing", () => ({ staffAcademyHref: (slug: string, path: string) => `/${slug}${path}` }));
vi.mock("@/components/shared/link", () => ({ default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));

Element.prototype.scrollIntoView ??= () => {};
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const ids = { q1: "10000000-0000-4000-8000-000000000001", q2: "10000000-0000-4000-8000-000000000002", doc: "20000000-0000-4000-8000-000000000001",
  section: "20000000-0000-4000-8000-000000000002", algebra: "20000000-0000-4000-8000-000000000003", review: "20000000-0000-4000-8000-000000000004" };
const scopeA = { academyId: "a0000000-0000-4000-8000-000000000001", academySlug: "science", accountId: "staff-a" };
const collections: BankCollections = { total: 2, collections: [
  { id: ids.algebra, kind: "topic", name: "Algebra", parentId: null, firstPage: null, count: 2 },
  { id: ids.doc, kind: "source_document", name: "Unit 3 book", parentId: null, firstPage: null, count: 2 },
  { id: ids.section, kind: "source_section", name: "Exercises", parentId: ids.doc, firstPage: 4, count: 1 },
  { id: ids.review, kind: "custom", name: "Revision", parentId: null, firstPage: null, count: 1 },
] };
const row = (id: string, prompt: string) => ({ id, unitId: null, prompt, printedNumber: "1", file: "book.pdf", page: 4, choice: false });
const page = (rows: BankPage["rows"], total = rows.length): { ok: true; data: BankPage } => ({ ok: true, data: { total, rows } });

function mount(scope = scopeA, client = new QueryClient()) {
  const ui = (value: typeof scope) => <QueryClientProvider client={client}><TooltipProvider><QuestionLibraryPage key={JSON.stringify(value)} scope={value} /></TooltipProvider></QueryClientProvider>;
  const view = render(ui(scope));
  return { client, rerender: (value: typeof scope) => view.rerender(ui(value)) };
}

it("searches and filters the whole library on the server, resetting pagination, and separates empty from no matches", async () => {
  vi.mocked(loadQuestionBankCollections).mockResolvedValue({ ok: true, data: collections });
  vi.mocked(listQuestionBank).mockImplementation(async ({ data }) => data.filters.query === "missing" ? page([])
    : page([row(ids.q1, `Question at ${data.filters.offset}`)], 30));
  mount();
  await screen.findByText("Question at 0");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Question at 24");
  fireEvent.click(within(screen.getByRole("navigation", { name: "Collections" })).getByRole("button", { name: /Exercises · p\. 4/ }));
  await waitFor(() => expect(vi.mocked(listQuestionBank).mock.lastCall![0]!.data.filters).toEqual({ collectionId: ids.section, query: "", offset: 0 }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Search questions" }), { target: { value: "missing" } });
  expect(await screen.findByText("No matching questions")).toBeTruthy();
  expect(vi.mocked(listQuestionBank).mock.lastCall![0]!.data).toMatchObject({ academyId: scopeA.academyId, filters: { collectionId: ids.section, query: "missing", offset: 0 } });
  expect(screen.queryByRole("list", { name: "Questions" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  await screen.findByText("Question at 0");
});

it("shows an empty library separately from a failed read, and retries", async () => {
  vi.mocked(loadQuestionBankCollections).mockResolvedValue({ ok: true, data: { total: 0, collections: [] } });
  vi.mocked(listQuestionBank).mockResolvedValueOnce({ ok: false, message: "Couldn’t load the question bank. Try again." }).mockResolvedValueOnce(page([]));
  mount();
  expect(await screen.findByText("Couldn’t load questions")).toBeTruthy();
  expect(screen.queryByText("No saved questions")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("No saved questions")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Import PDF" })).toBeTruthy();
});

it("previews a question in several collections and removes one membership without removing the question", async () => {
  vi.mocked(loadQuestionBankCollections).mockResolvedValue({ ok: true, data: collections });
  vi.mocked(listQuestionBank).mockResolvedValue(page([row(ids.q1, "Solve for x")]));
  vi.mocked(readQuestionBank).mockResolvedValue({ ok: true, data: { id: ids.q1, unitId: null, collections: [ids.doc, ids.section, ids.algebra, ids.review], payload: {
    prompt: "Solve for x", choices: [], answer: null, modelAnswer: "x = 2", topic: null, section: "Exercises", printedNumber: "1",
    source: { file: "book.pdf", page: 4, continuationPages: [5] }, visuals: [],
  } } });
  vi.mocked(setQuestionBankMembership).mockResolvedValue({ ok: true, data: 1 });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: /Solve for x/ }));
  const preview = within(await screen.findByRole("article", { name: "Question 1" }));
  expect(preview.getByText("Unit 3 book")).toBeTruthy();
  expect(preview.getByText("Exercises · p. 4")).toBeTruthy();
  expect(preview.getByText("4, 5")).toBeTruthy();
  expect(preview.getByText("x = 2")).toBeTruthy();
  expect(preview.queryByRole("button", { name: "Remove from Unit 3 book" })).toBeNull();
  fireEvent.click(preview.getByRole("button", { name: "Remove from Algebra" }));
  await waitFor(() => expect(setQuestionBankMembership).toHaveBeenCalledWith({ data: {
    academyId: scopeA.academyId, collectionId: ids.algebra, questionIds: [ids.q1], member: false,
  } }));
  await waitFor(() => expect(readQuestionBank).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("button", { name: /Solve for x/ })).toBeTruthy();
});

it("adds selected questions to a collection in bulk", async () => {
  vi.mocked(loadQuestionBankCollections).mockResolvedValue({ ok: true, data: collections });
  vi.mocked(listQuestionBank).mockResolvedValue(page([row(ids.q1, "First"), row(ids.q2, "Second")]));
  vi.mocked(setQuestionBankMembership).mockResolvedValue({ ok: true, data: 2 });
  mount();
  await screen.findByText("First");
  for (const box of screen.getAllByRole("checkbox", { name: "Select question 1" })) fireEvent.click(box);
  expect(screen.getByText("2 selected")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Add to collection" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("combobox", { name: "Topic or collection" }));
  fireEvent.click(await screen.findByRole("option", { name: "Revision" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
  await waitFor(() => expect(setQuestionBankMembership).toHaveBeenCalledWith({ data: {
    academyId: scopeA.academyId, collectionId: ids.review, questionIds: [ids.q1, ids.q2], member: true,
  } }));
  await waitFor(() => expect(screen.queryByText("2 selected")).toBeNull());
});

it("never shows a late response from the previous account or academy", async () => {
  vi.mocked(loadQuestionBankCollections).mockResolvedValue({ ok: true, data: { total: 1, collections: [] } });
  let finishA!: (value: ReturnType<typeof page>) => void;
  vi.mocked(listQuestionBank).mockImplementation(({ data }) => data.academyId === scopeA.academyId
    ? new Promise(resolve => { finishA = resolve; }) : Promise.resolve(page([row(ids.q2, "Academy B question")])));
  const { rerender, client } = mount();
  await waitFor(() => expect(finishA).toBeDefined());
  const scopeB = { academyId: "b0000000-0000-4000-8000-000000000002", academySlug: "other", accountId: "staff-b" };
  rerender(scopeB);
  await screen.findByText("Academy B question");
  await act(async () => finishA(page([row(ids.q1, "Academy A question")])));
  expect(screen.queryByText("Academy A question")).toBeNull();
  expect(client.getQueryCache().findAll({ queryKey: ["question-bank", scopeB.accountId, scopeB.academyId] })
    .every(query => JSON.stringify(query.state.data ?? "").includes("Academy A") === false)).toBe(true);
});
