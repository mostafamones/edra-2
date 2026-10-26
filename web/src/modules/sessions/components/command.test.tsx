// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Group } from "@/modules/groups";
import { buildAudienceLookup, type Schedule } from "@/modules/schedules";
import { ANY_AUDIENCE, audienceChoices, filterSchedules, scheduleAudience, selectAudience, todayTime } from "../command";
const mocks = vi.hoisted(() => ({ options: vi.fn(), start: vi.fn(), live: vi.fn(), retry: vi.fn(), busy: vi.fn(), back: vi.fn(), complete: vi.fn() }));
vi.mock("./use-schedule-options", () => ({ useScheduleOptions: mocks.options }));
vi.mock("./use-start-session", () => ({ useStartSession: () => ({ start: mocks.start }) }));
vi.mock("../queries", () => ({ fetchLiveSessions: mocks.live, liveSessionsQueryKey: (id: string) => ["sessions", id, "live"] }));
vi.mock("@/modules/schedules", async () => ({ ...await vi.importActual("@/modules/schedules/derive"), ...await vi.importActual("@/modules/schedules/time") }));
import { StartSessionCommand } from "./command";

const group: Group = { id: "g", academy_id: "academy", academic_year_id: "year", name: "Sunday A", level_id: "first", track_id: "science", capacity: null, notes: null, archived_at: null };
const lookup = buildAudienceLookup({ groups: [group], levelNames: { first: "First Secondary", second: "Second Secondary" }, tracks: [
  { id: "science", level_id: "first", name: "Scientific", sort_order: 1 }, { id: "literature", level_id: "first", name: "Literature", sort_order: 2 },
] });
function schedule(id: string, change: Partial<Schedule> = {}): Schedule {
  return { id, academy_id: "academy", academic_year_id: "year", title: id, kind: "recurring", audience: "level", level_id: "first", track_id: null, group_id: null, mandatory: true, location: null, archived_at: null, created_by: "staff", ...change };
}
const schedules = [schedule("C++ Fundamentals", { audience: "group", group_id: "g", level_id: null }), schedule("Whole grade"),
  schedule("Literature revision", { audience: "program", track_id: "literature" }), schedule("مُراجعة إحصاء", { level_id: "second" })];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.options.mockReturnValue({ schedules: { data: { year: { start_year: 2026 }, schedules, slots: [], sessions: [] } }, lookup, loading: false, failed: false, retry: mocks.retry });
  mocks.start.mockResolvedValue(true);
  mocks.live.mockResolvedValue({ sessions: [], nextCursor: null });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function open() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><StartSessionCommand academyId="academy" onBack={mocks.back} onComplete={mocks.complete} onBusyChange={mocks.busy} /></QueryClientProvider>); }
async function search(value: string, name = "Search schedules") { const input = await screen.findByRole("combobox", { name }); fireEvent.change(input, { target: { value } }); return input; }
async function enterOnlyOption(input: HTMLElement, title: RegExp) {
  const list = document.getElementById(input.getAttribute("aria-controls")!)!;
  const option = await within(list).findByRole("option", { name: title });
  await waitFor(() => expect(option.getAttribute("data-selected")).toBe("true"));
  fireEvent.keyDown(input, { key: "Enter" });
}
it("resolves group placement and filters schedules without narrowing a whole-grade roster", () => {
  expect(scheduleAudience(schedules[0], lookup)).toEqual({ grade: "first", track: "science", group: "g" });
  expect(filterSchedules(schedules, lookup, { grade: "first", track: "science", group: "" }).map(s => s.id)).toEqual(["C++ Fundamentals"]);
  expect(filterSchedules(schedules, lookup, { ...ANY_AUDIENCE, group: "g" }).map(s => s.id)).toEqual(["C++ Fundamentals"]);
  expect(filterSchedules(schedules, lookup, { ...ANY_AUDIENCE, grade: "first" })).toHaveLength(3);
  expect(filterSchedules(schedules, lookup, ANY_AUDIENCE, "مراجعة احصاء").map(s => s.id)).toEqual(["مُراجعة إحصاء"]);
});
it("scopes audience choices and clears dependent filters when changing grades/tracks", () => {
  expect(audienceChoices(schedules, lookup, { ...ANY_AUDIENCE, grade: "second" }, "track")).toEqual([]);
  expect(audienceChoices(schedules, lookup, ANY_AUDIENCE, "group")[0]).toMatchObject({ id: "g", count: 1 });
  expect(selectAudience({ grade: "first", track: "science", group: "g" }, "grade", "second", lookup)).toEqual({ grade: "second", track: "", group: "" });
  expect(selectAudience(ANY_AUDIENCE, "group", "g", lookup)).toEqual({ grade: "first", track: "science", group: "g" });
  expect(filterSchedules([schedule("Archived", { archived_at: "2026-01-01" })], lookup, ANY_AUDIENCE)).toEqual([]);
});
it("supports keyboard audience filtering, schedule choice and review before any start", async () => {
  open();
  await screen.findByRole("combobox", { name: "Search schedules" });
  expect(screen.queryByRole("option", { name: "Grade" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Filter grade" }));
  const gradeInput = await search("First", "Filter grade");
  await enterOnlyOption(gradeInput, /First Secondary/);
  expect(screen.queryByRole("option", { name: /مُراجعة/ })).toBeNull();
  const input = await search("Sunday Scientific");
  await enterOnlyOption(input, /C\+\+ Fundamentals/);
  expect(screen.getByText("Review session")).toBeTruthy();
  expect(screen.getByText("Sunday A · First Secondary · Scientific")).toBeTruthy();
  expect(screen.getByText("Mandatory · In-person")).toBeTruthy();
  expect(mocks.start).not.toHaveBeenCalled();
  const confirm = screen.getByRole("button", { name: "Start session" });
  await waitFor(() => expect(document.activeElement).toBe(confirm));
  fireEvent.click(confirm);
  await waitFor(() => expect(mocks.complete).toHaveBeenCalledOnce());
  expect(mocks.start).toHaveBeenCalledWith("C++ Fundamentals");
});
it("allows returning from review and empty-input Backspace without creating a session", async () => {
  open(); const input = await search("C++"); await enterOnlyOption(input, /C\+\+ Fundamentals/);
  fireEvent.click(screen.getByRole("button", { name: "Back to schedules" }));
  const restored = await screen.findByRole("combobox", { name: "Search schedules" });
  expect((restored as HTMLInputElement).value).toBe("C++");
  fireEvent.change(restored, { target: { value: "" } });
  fireEvent.keyDown(restored, { key: "Backspace" });
  expect(mocks.back).toHaveBeenCalledOnce(); expect(mocks.start).not.toHaveBeenCalled();
});
it("keeps review open on failure and guards repeated confirmation while pending", async () => {
  let finish!: (ok: boolean) => void;
  mocks.start.mockImplementation(() => new Promise<boolean>(resolve => { finish = resolve; }));
  open(); const input = await search("C++"); await enterOnlyOption(input, /C\+\+ Fundamentals/);
  fireEvent.click(screen.getByRole("button", { name: "Start session" }));
  fireEvent.click(screen.getByRole("button", { name: "Opening session…" }));
  expect(mocks.start).toHaveBeenCalledOnce(); expect(mocks.busy).toHaveBeenCalledWith(true);
  finish(false);
  await screen.findByRole("button", { name: "Start session" });
  expect(mocks.complete).not.toHaveBeenCalled(); expect(mocks.busy).toHaveBeenLastCalledWith(false);
});
it("loads all live pages and offers the existing session at review", async () => {
  mocks.live.mockResolvedValueOnce({ sessions: [], nextCursor: "page-2" }).mockResolvedValueOnce({ sessions: [{ scheduleId: "C++ Fundamentals" }], nextCursor: null });
  open(); await waitFor(() => expect(mocks.live).toHaveBeenCalledWith("academy", "page-2", expect.any(AbortSignal)));
  const input = await search("C++"); await enterOnlyOption(input, /C\+\+ Fundamentals/);
  expect(screen.getByRole("button", { name: "Open live session" })).toBeTruthy(); expect(mocks.start).not.toHaveBeenCalled();
});
it("shows load failures with retry rather than an empty schedule picker", async () => {
  mocks.options.mockReturnValue({ schedules: {}, lookup: null, loading: true, failed: true, retry: mocks.retry });
  open(); expect((await screen.findByRole("alert")).textContent).toContain("Could not load schedules.");
  fireEvent.click(screen.getByRole("button", { name: "Retry" })); expect(mocks.retry).toHaveBeenCalledOnce(); expect(mocks.start).not.toHaveBeenCalled();
});
it("keeps a recoverable empty state when no schedule matches", async () => {
  open(); await search("No such class");
  expect(await screen.findByText("No matching schedules")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));
  expect(await screen.findByRole("option", { name: /C\+\+ Fundamentals/ })).toBeTruthy();
  expect(mocks.start).not.toHaveBeenCalled();
});
it("lets typing and Enter choose a schedule without walking through filters", async () => {
  open(); const input = await search("C++");
  await enterOnlyOption(input, /C\+\+ Fundamentals/);
  expect(screen.getByText("Review session")).toBeTruthy(); expect(mocks.start).not.toHaveBeenCalled();
});
it("supports a minor spelling error without confusing grade numbers", () => {
  expect(filterSchedules(schedules, lookup, ANY_AUDIENCE, "Scienific").map(s => s.id)).toEqual(["C++ Fundamentals"]);
  expect(filterSchedules([schedule("Grade 12")], lookup, ANY_AUDIENCE, "13")).toEqual([]);
});
it("resolves today's times on the academy calendar without restricting other schedules", () => {
  const slots = [{ id: "slot", academy_id: "academy", academic_year_id: "year", schedule_id: "class", weekday: 1, starts_at: "18:00:00", ends_at: "19:00:00" }];
  expect(todayTime("class", slots, [], "2026-10-26 17:00:00")).toMatchObject({ startsAt: "18:00:00", passed: false });
  expect(todayTime("class", slots, [], "2026-10-26 20:00:00")).toMatchObject({ passed: true });
  expect(todayTime("class", slots, [], "2026-10-27 17:00:00")).toBeNull();
});
it("does not offer a start without an open academic year", async () => {
  mocks.options.mockReturnValue({ schedules: { data: { year: null, schedules: [], slots: [], sessions: [] } }, lookup, loading: false, failed: false, retry: mocks.retry });
  open(); expect(await screen.findByText("No open academic year")).toBeTruthy();
  expect(screen.queryByRole("option")).toBeNull(); expect(mocks.start).not.toHaveBeenCalled();
});
it("keeps filter Enter inside its popover and restores the schedule search focus", async () => {
  open(); await screen.findByRole("combobox", { name: "Search schedules" });
  fireEvent.click(screen.getByRole("button", { name: "Filter track" }));
  const input = await search("Scientific", "Filter track");
  await enterOnlyOption(input, /Scientific/);
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Track filter" })).toBeNull());
  expect(screen.queryByText("Review session")).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Search schedules" })));
  expect(mocks.start).not.toHaveBeenCalled();
});
