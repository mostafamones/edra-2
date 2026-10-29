// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({ query: "", replace: vi.fn(), rpc: vi.fn(), role: "admin" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/science/assessments",
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.query),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/modules/auth", () => {
  const academy = () => ({ id: "academy-id", name: "Science", slug: "science", role: mocks.role });
  return {
    useAuth: () => ({ user: { id: "user-1" }, activeAcademy: academy() }),
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

import { TooltipProvider } from "@/components/ui/tooltip";
import { AssessmentsPage } from "./page";

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
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TooltipProvider><AssessmentsPage /></TooltipProvider></QueryClientProvider>);
}
const links = (container: HTMLElement) => within(container).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")]);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query = "";
  mocks.role = "admin";
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
  mocks.rpc.mockResolvedValue({ data: { total: 3, items: ITEMS, server_now: "now" }, error: null });
});
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); });

describe("staff Assessments page", () => {
  it("shows the same items in the same order in Table and Cards, and switching keeps the URL state", async () => {
    mocks.query = "type=all&q=unit&sort=title&page=1";
    show();
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent))
      .toEqual(["Title", "Type", "Status", "Date", "Marked", "Maximum marks"]);
    const tableLinks = links(table);
    expect(tableLinks).toEqual([
      ["Term exam", "http://app.lvh.me:3000/science/exams/e1"],
      ["Unit homework", "http://app.lvh.me:3000/science/assignments/a1"],
      ["Weekly quiz", "http://app.lvh.me:3000/science/quizzes/q1"],
    ]);
    expect(within(table).getAllByText("10.5", { selector: "td" })).toHaveLength(3);
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
    const date = within(exam).getAllByRole("cell")[3];
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
    expect(within(exam).getAllByRole("cell")[4].textContent).toBe("4 / 12");
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
    fireEvent.click(screen.getByRole("radio", { name: "Quizzes" }));
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

  it("remembers the list state for workspace back links", async () => {
    mocks.query = "type=quiz&page=2";
    show();
    await screen.findByRole("table");
    expect(sessionStorage.getItem("edra:assessments-return:science")).toBe("type=quiz&page=2");
  });
});
