// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({ query: "", replace: vi.fn(), push: vi.fn(), rpc: vi.fn(), role: "admin", details: vi.fn(), saveDetails: vi.fn(), examStudents: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/science/assessments",
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.query),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/modules/auth", () => {
  const academy = () => ({ id: "academy-id", name: "Science", slug: "science", role: mocks.role });
  return {
    useAuth: () => ({ user: { id: "user-1" }, activeAcademy: academy() }),
    useAcademyScope: () => () => true,
    AcademyGate: ({ children }: { children: (academy: unknown) => ReactNode }) => children(academy()),
  };
});
vi.mock("@/components/shared/assessment/workspace/names", () => ({
  useAudienceNames: () => ({}),
  describeAudience: (item: { audience: string | null }) => item.audience === null ? "No audience yet" : `Audience ${item.audience}`,
}));
vi.mock("@/modules/assignments", async (original) => ({
  ...await original<typeof import("@/modules/assignments")>(),
  loadYears: async () => [{ id: "11111111-1111-4111-8111-111111111111", startYear: 2026, open: true }],
}));
vi.mock("@/modules/exams", async (original) => ({
  ...await original<typeof import("@/modules/exams")>(),
  loadExamStudents: mocks.examStudents,
}));
vi.mock("@/modules/groups", async (original) => ({
  ...await original<typeof import("@/modules/groups")>(),
  loadGroups: async (_academy: string, options?: { archived?: boolean }) => ({ year: { id: "year" }, groups: options?.archived ? [] : [
    { id: "33333333-3333-4333-8333-333333333333", name: "Nine A", level_id: "preparatory-3", archived_at: null },
    { id: "44444444-4444-4444-8444-444444444444", name: "Ten A", level_id: "secondary-1", archived_at: null },
  ] }),
  loadStructure: async () => ({
    levels: [{ level_id: "preparatory-3", sort_order: 1 }, { level_id: "secondary-1", sort_order: 2 }],
    tracks: [{ id: "22222222-2222-4222-8222-222222222222", level_id: "secondary-1", name: "Science", sort_order: 1 }],
    levelNames: { "preparatory-3": "Preparatory 3", "secondary-1": "First Secondary" },
  }),
}));
vi.mock("../details", async (original) => ({
  ...await original<typeof import("../details")>(),
  loadDetails: mocks.details, saveDetails: mocks.saveDetails,
}));

import { TooltipProvider } from "@/components/ui/tooltip";
import { HEADER_ACTIONS_ID } from "@/components/shared/header-actions";
import { AssessmentsPage } from "./page";
import type { AssessmentDetails, DetailsResult, QuickValues } from "../details";
import { assignmentFixture, examFixture, quizFixture } from "../details.fixture";

const row = (type: string, id: string, title: string, status: string, extra: Record<string, unknown> = {}) => ({
  type, id, title, status, academic_year_id: "year", audience: "level", level_id: "preparatory-3", track_id: null, group_ids: [],
  max_score: "10.50", marked_count: 4, audience_count: 12, created_at: "2026-10-01T10:00:00Z", due_at: null, opens_at: null, closes_at: null, processing_pending: false, parts: [], ...extra,
});
const ITEMS = [
  row("exam", "e1", "Term exam", "open", { opens_at: "2026-10-01T08:00:00Z", closes_at: "2026-10-01T09:00:00Z",
    parts: [{ title: "Choices", kind: "question_sheet" }, { title: "Essay", kind: "written_work" }] }),
  row("assignment", "a1", "Unit homework", "active", { due_at: "2026-10-02T08:00:00Z", parts: [{ title: "Homework", kind: "file_upload" }] }),
  row("quiz", "q1", "Weekly quiz", "preparing", { audience: null }),
];
const listCalls = () => mocks.rpc.mock.calls.filter(([name]) => name === "list_assessments");

function show() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TooltipProvider><header><div id={HEADER_ACTIONS_ID} /></header><AssessmentsPage /></TooltipProvider></QueryClientProvider>);
}
const links = (container: HTMLElement) => within(container).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")]);

async function pickNovemberDate(sheet: HTMLElement, label: string, time: string) {
  const trigger = within(sheet).getByRole("button", { name: label });
  fireEvent.click(trigger);
  const picker = await screen.findByRole("dialog", { name: `${label} picker` });
  fireEvent.change(within(picker).getByRole("combobox", { name: "Choose the Year" }), { target: { value: "2026" } });
  fireEvent.change(within(picker).getByRole("combobox", { name: "Choose the Month" }), { target: { value: "10" } });
  fireEvent.click(within(picker).getByRole("button", { name: /November 1st, 2026/ }));
  fireEvent.change(within(picker).getByLabelText(`${label} time`), { target: { value: time } });
  fireEvent.click(within(picker).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(document.activeElement).toBe(trigger));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query = "";
  mocks.role = "admin";
  mocks.examStudents.mockResolvedValue([{ recordId: "r1", fullName: "Mona Adel", studentCode: "S1", result: { total: "40", complete: true } }]);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
  mocks.rpc.mockResolvedValue({ data: { total: 3, items: ITEMS, server_now: "now" }, error: null });
  mocks.details.mockImplementation(async (_academy: string, type: string) => ({ type, value: type === "assignment" ? assignmentFixture() : type === "quiz" ? quizFixture() : examFixture() }));
  mocks.saveDetails.mockImplementation(async (record: AssessmentDetails, values: QuickValues, availability?: { opensAt: string | null; closesAt: string | null }) => ({ ok: true, record: { ...record, value: { ...record.value, ...availability, title: values.title, version: record.value.version + 1 } } }));
});
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); });

describe("staff Assessments page", () => {
  it("groups Filter and View options and shows the range and per-page control on one-page results", async () => {
    show();
    await screen.findByRole("table");
    const filters = screen.getByRole("button", { name: "Filters" });
    const group = filters.closest('[role="group"]') as HTMLElement;
    expect(within(group).getByRole("button", { name: "View options" })).toBeTruthy();
    expect(screen.getByText("Showing 1–3 of 3")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Per page" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next page" }).hasAttribute("disabled")).toBe(true);
  });

  it("changes page size while keeping filters and returning to the first page", async () => {
    mocks.query = "type=quiz&q=unit&pageSize=48&page=2";
    mocks.rpc.mockResolvedValue({ data: { total: 100, items: ITEMS, server_now: "now" }, error: null });
    show();
    await screen.findByRole("table");
    expect(listCalls()[0][1]).toMatchObject({ p_limit: 48, p_offset: 48 });
    const select = screen.getByRole("combobox", { name: "Per page" });
    fireEvent.keyDown(select, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "12" }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/science/assessments?type=quiz&q=unit&pageSize=12", { scroll: false });
  });

  it.each(["table", "cards"])("opens quick edit from a %s context menu without exposing the full editor", async (view) => {
    localStorage.setItem("edra:assessments-view:user-1", view);
    show();
    const link = await screen.findByRole("link", { name: "Term exam" });
    const target = link.closest(view === "table" ? "tr" : "li")!;
    fireEvent.contextMenu(target, { button: 2, clientX: 20, clientY: 20 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit exam" });
    const name = await within(sheet).findByRole("textbox", { name: "Name" });
    expect((name as HTMLInputElement).value).toBe("Term exam");
    expect(within(sheet).getByRole("textbox", { name: "Part 1" }).closest('[data-slot="field"]')?.getAttribute("data-orientation")).toBe("horizontal");
    const part = within(sheet).getByRole("textbox", { name: "Part 1" }).closest('[data-slot="field"]')!;
    expect(within(part as HTMLElement).getByText("Question Sheet")).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "Close" })).toBeTruthy();
    expect(within(sheet).queryByText(/Cairo/)).toBeNull();
    expect(within(sheet).getByRole("spinbutton", { name: "Timer" })).toBeTruthy();
    expect(within(sheet).getByLabelText("Opens")).toBeTruthy();
    expect(within(sheet).queryByLabelText(/instructions|question|correct answer/i)).toBeNull();
    expect(within(sheet).getByRole("link", { name: "Open editor" }).getAttribute("href")).toBe("http://app.lvh.me:3000/science/exams/e1/edit");
    fireEvent.change(name, { target: { value: "Renamed exam" } });
    fireEvent.change(within(sheet).getByRole("textbox", { name: "Part 1" }), { target: { value: "New part name" } });
    fireEvent.change(within(sheet).getByRole("spinbutton", { name: "Timer" }), { target: { value: "45" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.saveDetails).toHaveBeenCalledWith(expect.objectContaining({ type: "exam", value: expect.objectContaining({ version: 7 }) }), expect.objectContaining({ title: "Renamed exam", timeLimit: "45", parts: [{ id: "part-1", title: "New part name" }] }), undefined));
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit exam" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(target));
  });

  it("lists Edit, Summary and Open editor from the Actions button, and Summary opens its tab in the edit sheet", async () => {
    show();
    await screen.findByRole("table");
    const trigger = screen.getByRole("button", { name: "Actions for Term exam" });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Edit", "Summary", "Open editor"]);
    expect(within(menu).getByRole("menuitem", { name: "Open editor" }).getAttribute("href")).toBe("http://app.lvh.me:3000/science/exams/e1/edit");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Summary" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit exam" });
    expect(within(sheet).getByRole("tab", { name: "Summary" }).getAttribute("aria-selected")).toBe("true");
    expect(await within(sheet).findByText("Mona Adel")).toBeTruthy();
    expect(within(sheet).getByRole("columnheader", { name: "Student" })).toBeTruthy();
    fireEvent.mouseDown(within(sheet).getByRole("tab", { name: "Edit" }), { button: 0, ctrlKey: false });
    expect(((await within(sheet).findByRole("textbox", { name: "Name" })) as HTMLInputElement).value).toBe("Term exam");
  });

  it("keeps the sheet usable when scores fail and allows retrying Summary", async () => {
    mocks.examStudents.mockRejectedValueOnce(new Error("Unavailable"));
    show();
    fireEvent.contextMenu((await screen.findByRole("link", { name: "Term exam" })).closest("tr")!, { button: 2 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Summary" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit exam" });
    expect(await within(sheet).findByText("Couldn’t load assessment scores.")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Retry scores" }));
    expect(await within(sheet).findByText("Mona Adel")).toBeTruthy();
    fireEvent.mouseDown(within(sheet).getByRole("tab", { name: "Edit" }), { button: 0, ctrlKey: false });
    expect(await within(sheet).findByRole("textbox", { name: "Name" })).toBeTruthy();
  });

  it.each(["quiz", "exam"] as const)("steps the %s timer by 30 minutes, by 5 with Shift, and still saves a typed value", async (type) => {
    show();
    const title = type === "quiz" ? "Weekly quiz" : "Term exam";
    fireEvent.contextMenu((await screen.findByRole("link", { name: title })).closest("tr")!, { button: 2 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const sheet = await screen.findByRole("dialog", { name: `Edit ${type}` });
    const input = await within(sheet).findByRole("spinbutton", { name: "Timer" }) as HTMLInputElement;
    const more = within(sheet).getByRole("button", { name: "Increase timer" });
    const less = within(sheet).getByRole("button", { name: "Decrease timer" });
    const initial = type === "quiz" ? 20 : 60;
    expect(input.type).toBe("text");
    expect(within(input.closest('[data-slot="input-group"]') as HTMLElement).getByText("minutes")).toBeTruthy();
    fireEvent.click(more);
    expect(input.value).toBe(String(initial + 30));
    expect(document.activeElement).toBe(input);
    fireEvent.click(more, { shiftKey: true });
    expect(input.value).toBe(String(initial + 35));
    fireEvent.click(less);
    expect(input.value).toBe(String(initial + 5));
    fireEvent.click(less, { shiftKey: true });
    expect(input.value).toBe(String(initial));
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.value).toBe(String(initial + 30));
    fireEvent.keyDown(input, { key: "ArrowDown", shiftKey: true });
    expect(input.value).toBe(String(initial + 25));
    fireEvent.change(input, { target: { value: "590" } });
    fireEvent.click(more);
    expect(input.value).toBe("600");
    expect(more.hasAttribute("disabled")).toBe(true);
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.click(less, { shiftKey: true });
    expect(input.value).toBe("1");
    expect(less.hasAttribute("disabled")).toBe(true);
    fireEvent.change(input, { target: { value: "125" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.saveDetails).toHaveBeenCalledWith(expect.objectContaining({ type }), expect.objectContaining({ timeLimit: "125" }), undefined));
  });

  it("saves details and calendar dates together from one Save action", async () => {
    show();
    const link = await screen.findByRole("link", { name: "Term exam" });
    fireEvent.keyDown(link.closest("tr")!, { key: "F10", shiftKey: true });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit exam" });
    const name = await within(sheet).findByRole("textbox", { name: "Name" });
    fireEvent.change(name, { target: { value: "My unsaved title" } });
    await pickNovemberDate(sheet, "Opens", "12:00");
    await pickNovemberDate(sheet, "Closes", "13:00");
    expect(mocks.saveDetails).not.toHaveBeenCalled();
    expect((name as HTMLInputElement).value).toBe("My unsaved title");
    expect(within(sheet).getAllByRole("button", { name: "Save" })).toHaveLength(1);
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.saveDetails).toHaveBeenCalledWith(
      expect.objectContaining({ value: expect.objectContaining({ version: 7 }) }), expect.objectContaining({ title: "My unsaved title" }),
      { opensAt: "2026-11-01T10:00:00.000Z", closesAt: "2026-11-01T11:00:00.000Z" },
    ));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit exam" })).toBeNull());
  }, 15000);

  it("respects locked audience, timer and parts, and instructor availability permissions", async () => {
    mocks.role = "instructor";
    mocks.details.mockResolvedValue({ type: "quiz", value: quizFixture({ workStartedAt: "now", structureLockedAt: "now" }) });
    show();
    fireEvent.contextMenu((await screen.findByRole("link", { name: "Weekly quiz" })).closest("tr")!, { button: 2 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit quiz" });
    await within(sheet).findByRole("textbox", { name: "Name" });
    expect(within(sheet).getByRole("spinbutton", { name: "Timer" }).hasAttribute("disabled")).toBe(true);
    expect(within(sheet).getByRole("button", { name: "Increase timer" }).hasAttribute("disabled")).toBe(true);
    expect(within(sheet).getByRole("button", { name: "Decrease timer" }).hasAttribute("disabled")).toBe(true);
    expect(within(sheet).getByRole("textbox", { name: "Part 1" }).hasAttribute("disabled")).toBe(true);
    expect(within(sheet).getByLabelText("Opens").hasAttribute("disabled")).toBe(true);
    expect(within(sheet).queryByRole("button", { name: "Save dates" })).toBeNull();
    expect(within(sheet).getByRole("textbox", { name: "Name" }).hasAttribute("disabled")).toBe(false);
  });

  it("preserves a stale draft until an explicit reload and confirms unsaved navigation to the full editor", async () => {
    mocks.saveDetails.mockResolvedValue({ ok: false, code: "assignment_conflict", message: "Changed elsewhere. Review latest." });
    show();
    fireEvent.contextMenu((await screen.findByRole("link", { name: "Unit homework" })).closest("tr")!, { button: 2 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit assignment" });
    const name = await within(sheet).findByRole("textbox", { name: "Name" });
    expect(within(sheet).getByLabelText("Due date")).toBeTruthy();
    fireEvent.change(name, { target: { value: "My draft" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await within(sheet).findByText("Changed elsewhere. Review latest.");
    expect((name as HTMLInputElement).value).toBe("My draft");
    expect(mocks.details).toHaveBeenCalledTimes(1);
    fireEvent.click(within(sheet).getByRole("button", { name: "Reload latest" }));
    mocks.details.mockResolvedValue({ type: "assignment", value: assignmentFixture({ title: "Latest title", version: 8 }) });
    fireEvent.click(await screen.findByRole("button", { name: "Discard unsaved changes" }));
    await waitFor(() => expect((name as HTMLInputElement).value).toBe("Latest title"));
    fireEvent.change(name, { target: { value: "Another draft" } });
    fireEvent.click(within(sheet).getByRole("link", { name: "Open editor" }));
    expect(mocks.push).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Discard unsaved changes" }));
    expect(mocks.push).toHaveBeenCalledWith("http://app.lvh.me:3000/science/assignments/a1/edit");
  });

  it("blocks closing during a save and reconciles an unconfirmed outcome through an explicit reload", async () => {
    let finish!: (result: DetailsResult) => void;
    mocks.saveDetails.mockImplementation(() => new Promise<DetailsResult>((resolve) => { finish = resolve; }));
    show();
    fireEvent.contextMenu((await screen.findByRole("link", { name: "Unit homework" })).closest("tr")!, { button: 2 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit assignment" });
    const name = await within(sheet).findByRole("textbox", { name: "Name" });
    fireEvent.change(name, { target: { value: "Possibly saved" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.saveDetails).toHaveBeenCalledTimes(1));
    fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog", { name: "Edit assignment" })).toBeTruthy();
    await act(async () => { finish({ ok: false, code: "unavailable", message: "Connection lost." }); });
    expect(await within(sheet).findByText(/The save could not be confirmed/)).toBeTruthy();
    expect(name.hasAttribute("disabled")).toBe(true);
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    expect((await screen.findByRole("button", { name: "Discard unsaved changes" })).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    mocks.details.mockResolvedValue({ type: "assignment", value: assignmentFixture({ title: "Possibly saved", version: 8 }) });
    fireEvent.click(within(sheet).getByRole("button", { name: "Reload latest" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard unsaved changes" }));
    await waitFor(() => expect(name.hasAttribute("disabled")).toBe(false));
    expect((name as HTMLInputElement).value).toBe("Possibly saved");
    expect(mocks.saveDetails).toHaveBeenCalledTimes(1);
  });
  it("shows the same items in the same order in Table and Cards, and switching keeps the URL state", async () => {
    mocks.query = "type=all&q=unit&sort=title&page=1";
    show();
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent))
      .toEqual(["Title", "Type", "Parts", "Status", "Date", "Marked", "Actions"]);
    const tableLinks = links(table);
    expect(tableLinks).toEqual([
      ["Term exam", "http://app.lvh.me:3000/science/exams/e1"],
      ["Unit homework", "http://app.lvh.me:3000/science/assignments/a1"],
      ["Weekly quiz", "http://app.lvh.me:3000/science/quizzes/q1"],
    ]);
    expect(within(table).getByText("2 parts")).toBeTruthy();
    expect(within(table).queryByText("10.5")).toBeNull();
    expect(within(table).getByText("Not set")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^View options/ }));
    fireEvent.click(await screen.findByRole("radio", { name: "Cards" }));
    await waitFor(() => expect(screen.queryByRole("table")).toBeNull());
    expect(links(screen.getByRole("list"))).toEqual(tableLinks);
    expect(localStorage.getItem("edra:assessments-view:user-1")).toBe("cards");
    // The view is not URL state: no navigation and no new request.
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(listCalls()).toHaveLength(1);
    expect(listCalls()[0][1]).toMatchObject({ p_search: "unit", p_sort: "title", p_offset: 0 });
  });

  it("keeps each type's own status and date labels", async () => {
    show();
    const table = await screen.findByRole("table");
    const [exam, assignment, quiz] = within(table).getAllByRole("row").slice(1);
    expect(exam.textContent).toContain("Open");
    expect(exam.textContent).toMatch(/Opens .*Closes /);
    // A short label, with the full dates for hover and screen readers.
    const date = within(exam).getAllByRole("cell")[4];
    expect(date.querySelector("[aria-hidden=true]")?.textContent).toBe("Closed 1 Oct noon");
    expect(date.textContent).toContain("Opens Thu, 1 Oct 2026 at 11:00 am, Closes Thu, 1 Oct 2026 at 12:00 pm");
    expect(assignment.textContent).toContain("Active");
    expect(assignment.textContent).toContain("Due ");
    expect(quiz.textContent).toContain("Preparing");
    expect(quiz.textContent).toContain("No audience yet");
  });

  it("puts the audience under the title with its kind, and shows marked of audience", async () => {
    show();
    const table = await screen.findByRole("table");
    const [exam, , quiz] = within(table).getAllByRole("row").slice(1);
    const title = within(exam).getAllByRole("cell")[0];
    expect(title.textContent).toBe("Term examProgram-wide:Audience level");
    expect(within(quiz).getAllByRole("cell")[0].textContent).toBe("Weekly quizNo audience yet");
    expect(within(exam).getAllByRole("cell")[1].textContent).toBe("Exam");
    expect(within(exam).getAllByRole("cell")[5].textContent).toBe("4 / 12");
    expect(within(table).getAllByRole("row").slice(1).every((row) => row.classList.contains("h-16"))).toBe(true);
  });

  it("shows each card's parts: the kind of a single part, or a count listing them all", async () => {
    localStorage.setItem("edra:assessments-view:user-1", "cards");
    show();
    const cards = within(await screen.findByRole("list")).getAllByRole("listitem");
    expect(cards[0].textContent).toContain("2 parts: Choices, Question Sheet; Essay, Written Work");
    expect(cards[1].textContent).toContain("Manual marking");
    expect(cards[2].textContent).toContain("No parts yet");
  });

  it("writes type, filters and paging to the URL; changing type returns to page 1 with the other filters kept", async () => {
    mocks.query = "q=unit&audience=program&page=2";
    mocks.rpc.mockResolvedValue({ data: { total: 60, items: ITEMS, server_now: "now" }, error: null });
    show();
    await screen.findByRole("table");
    expect(listCalls()[0][1]).toMatchObject({ p_offset: 24, p_audience: "program", p_academic_year_id: "11111111-1111-4111-8111-111111111111" });
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/science/assessments?q=unit&audience=program&page=3", { scroll: false });
    fireEvent.click(within(screen.getByRole("banner")).getByRole("radio", { name: "Quizzes" }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/science/assessments?type=quiz&q=unit&audience=program", { scroll: false });
  });

  it("replaces the whole table with an empty state and keeps the toolbar", async () => {
    mocks.rpc.mockResolvedValue({ data: { total: 0, items: [], server_now: "now" }, error: null });
    show();
    expect(await screen.findByText("No assessments yet")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("columnheader")).toBeNull();
    expect(screen.getByRole("searchbox", { name: "Search assessments" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Create assessment" })).toHaveLength(2);
  });

  it("offers Clear filters when filters match nothing", async () => {
    mocks.query = "type=exam&q=zzz";
    mocks.rpc.mockResolvedValue({ data: { total: 0, items: [], server_now: "now" }, error: null });
    show();
    expect(await screen.findByText("No matching assessments")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/science/assessments", { scroll: false });
  });

  it("shows a load failure instead of an empty or partial list", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    show();
    expect(await screen.findByText("Couldn’t load assessments")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("No assessments yet")).toBeNull();
    // A row with a status from the wrong type also fails the whole page.
    cleanup();
    mocks.rpc.mockResolvedValue({ data: { total: 2, items: [ITEMS[0], row("quiz", "q9", "Bad", "active")], server_now: "now" }, error: null });
    show();
    expect(await screen.findByText("Couldn’t load assessments")).toBeTruthy();
    expect(screen.queryByText("Term exam")).toBeNull();
  });

  it("creates each type through its existing create page", async () => {
    show();
    await screen.findByRole("table");
    const trigger = screen.getByRole("button", { name: "Create assessment" });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((item) => [item.textContent, item.getAttribute("href")])).toEqual([
      ["Assignment", "http://app.lvh.me:3000/science/assignments/new"],
      ["Quiz", "http://app.lvh.me:3000/science/quizzes/new"],
      ["Exam", "http://app.lvh.me:3000/science/exams/new"],
    ]);
  });

  it("groups by type or by status word across types, with headings in both views", async () => {
    mocks.query = "group=status";
    mocks.rpc.mockResolvedValue({ data: { total: 4, server_now: "now", items: [
      ITEMS[2], ITEMS[1], row("assignment", "a2", "Closed homework", "closed"), row("quiz", "q2", "Closed quiz", "closed"),
    ] }, error: null });
    show();
    const table = await screen.findByRole("table");
    expect(listCalls()[0][1]).toMatchObject({ p_group: "status" });
    const headings = within(table).getAllByRole("row").filter((tr) => tr.querySelector("td[colspan]")).map((tr) => tr.textContent);
    // One group per status word, whatever the type; each row keeps its own type's badge.
    expect(headings).toEqual(["Preparing", "Active", "Closed"]);
    cleanup();
    localStorage.setItem("edra:assessments-view:user-1", "cards");
    mocks.query = "group=type";
    mocks.rpc.mockResolvedValue({ data: { total: 3, server_now: "now", items: [ITEMS[1], ITEMS[2], ITEMS[0]] }, error: null });
    show();
    expect((await screen.findAllByRole("heading", { level: 2 })).map((h) => h.textContent)).toEqual(["Assignments", "Quizzes", "Exams"]);
  });

  it("toggles each type's statuses and changes grouping and order from View options", async () => {
    mocks.query = "type=quiz";
    show();
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: /^View options/ }));
    // Only the selected type's statuses are offered.
    expect(await screen.findByRole("group", { name: "Quizzes" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Assignments" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Archived", pressed: false }));
    expect(mocks.replace).toHaveBeenLastCalledWith(expect.stringContaining("quiz%3Aarchived"), { scroll: false });
    fireEvent.click(screen.getByRole("button", { name: "Open", pressed: true }));
    const url = new URL(`http://x${mocks.replace.mock.lastCall![0]}`);
    expect(url.searchParams.get("statuses")?.split(",")).not.toContain("quiz:open");
  });

  it("collapses a group in either view and keeps it collapsed when switching views", async () => {
    mocks.query = "group=type";
    show();
    const table = await screen.findByRole("table");
    const toggle = within(table).getByRole("button", { name: "Assignments" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(within(table).queryByText("Unit homework")).toBeNull();
    expect(within(table).getByText("Term exam")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^View options/ }));
    fireEvent.click(await screen.findByRole("radio", { name: "Cards" }));
    await waitFor(() => expect(screen.queryByRole("table")).toBeNull());
    expect(screen.getByRole("button", { name: "Assignments" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Unit homework")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Assignments" }));
    expect(await screen.findByText("Unit homework")).toBeTruthy();
  });

  it("toggles a status for every type at once, or per type, and locks to all types when grouping by status", async () => {
    show();
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: /^View options/ }));
    const closed = await screen.findByRole("button", { name: "Closed", pressed: true });
    fireEvent.click(closed, { detail: 1 });
    const hidden = new URL(`http://x${mocks.replace.mock.lastCall![0]}`).searchParams.get("statuses")!.split(",");
    expect(hidden.some((key) => key.endsWith(":closed"))).toBe(false);
    // Per type: one section per type, each with its own Closed.
    fireEvent.click(screen.getByRole("radio", { name: "Per type" }));
    expect(screen.getAllByRole("button", { name: "Closed" })).toHaveLength(3);
    expect(screen.getByRole("group", { name: "Exams" })).toBeTruthy();
    cleanup();
    mocks.query = "group=status&statuses=assignment%3Aactive%2Cquiz%3Aclosed";
    show();
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: /^View options/ }));
    expect((await screen.findByRole("radio", { name: "All types" })).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Per type" }).hasAttribute("disabled") || screen.getByRole("radiogroup", { name: "Status toggles" }).hasAttribute("data-disabled")).toBe(true);
    // Only the quiz's Closed is shown, so the combined toggle is mixed; clicking shows Closed for every type.
    const mixed = screen.getByRole("button", { name: "Closed" });
    expect(mixed.getAttribute("aria-pressed")).toBe("mixed");
    fireEvent.click(mixed, { detail: 1 });
    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/science/assessments?statuses=assignment%3Aactive%2Cassignment%3Aclosed%2Cquiz%3Aclosed%2Cexam%3Aclosed&group=status", { scroll: false });
  });

  it("isolates a status on double-click and restores the earlier selection on the next click", async () => {
    mocks.query = "type=quiz";
    show();
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: /^View options/ }));
    const archived = await screen.findByRole("button", { name: "Archived", pressed: false });
    expect(archived.className).toContain("line-through");
    const open = screen.getByRole("button", { name: "Open", pressed: true });
    fireEvent.click(open, { detail: 1 });
    fireEvent.click(open, { detail: 2 });
    fireEvent.doubleClick(open);
    expect(mocks.replace).toHaveBeenLastCalledWith("/science/assessments?type=quiz&statuses=quiz%3Aopen", { scroll: false });
    // The double-click's first click toggled Open off; isolation restores what was shown before that click.
    mocks.query = "type=quiz&statuses=quiz%3Aopen";
    fireEvent.click(screen.getByRole("button", { name: "Ready" }), { detail: 1 });
    expect(mocks.replace).toHaveBeenLastCalledWith("/science/assessments?type=quiz", { scroll: false });
  });

  it("shows Level always, Track for program-wide levels with tracks and Group for group-wide, and sends them", async () => {
    show();
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const labels = async () => (await screen.findAllByText(/^(Audience type|Level|Track|Group)$/)).map((label) => label.textContent);
    expect(await labels()).toEqual(["Audience type", "Level"]);
    cleanup();
    mocks.query = "audience=program&level=secondary-1&track=22222222-2222-4222-8222-222222222222";
    show();
    await screen.findByRole("table");
    expect(listCalls().at(-1)![1]).toMatchObject({ p_audience: "program", p_level_id: "secondary-1", p_track_id: "22222222-2222-4222-8222-222222222222", p_group_id: null });
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    await waitFor(async () => expect(await labels()).toEqual(["Audience type", "Level", "Track"]));
    cleanup();
    mocks.query = "audience=groups&level=preparatory-3&groupId=33333333-3333-4333-8333-333333333333";
    show();
    await screen.findByRole("table");
    expect(listCalls().at(-1)![1]).toMatchObject({ p_audience: "groups", p_level_id: "preparatory-3", p_group_id: "33333333-3333-4333-8333-333333333333" });
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    await waitFor(async () => expect(await labels()).toEqual(["Audience type", "Level", "Group"]));
    // Clearing narrower filters when a wider one changes.
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/science/assessments", { scroll: false });
  });

  it("remembers the list state for workspace back links", async () => {
    mocks.query = "type=quiz&page=2";
    show();
    await screen.findByRole("table");
    expect(sessionStorage.getItem("edra:assessments-return:science")).toBe("type=quiz&page=2");
  });
});
