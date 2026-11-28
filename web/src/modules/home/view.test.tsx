// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { HomeView } from "./view";
import { rate, type Overview, type Week } from "./overview";
vi.mock("@/components/shared/link", () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));
beforeAll(() => { globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never; });
afterEach(cleanup);
const read = <T,>(data: T) => ({ data, error: null, isPending: false, isFetching: false, refetch: vi.fn(async () => {}) });
const week = (day: string, marks: Partial<Week> = {}): Week => ({ week: day, sessions: 0, attended: 0, counted: 0, present: 0, late: 0, absent: 0, excused: 0, added: 0, ...marks });
const data: Overview = { year: 2026, asOf: "2026-10-29T12:00:00Z", attentionCount: 1,
  students: { total: 20, online: 5, levels: [{id: "secondary-2", name: "Secondary", total: 20, online: 5}] },
  attention: [{kind: "review", id: "u", title: "Loops", amount: 1}], today: [] };
const dashboard: Overview = { ...data,
  attendance: Array.from({ length: 12 }, (_, index) => week(`2026-09-${String(index + 1).padStart(2, "0")}`, index < 8 ? { sessions: 1, attended: 3, counted: 4, present: 3, absent: 1 } : { sessions: 2, attended: 9, counted: 10, present: 8, late: 1, absent: 1, added: 1 })),
  watch: [{ id: "r1", name: "Nour Ali", level: "Secondary", score: 42, change: -18, trend: [{ week: "2026-10-18", score: 60, attendance: 70, assignment: 50 }, { week: "2026-10-25", score: 42, attendance: 50, assignment: 34 }] }],
  assignments: [{ id: "a1", title: "Fractions", at: "2026-10-08T20:59:00Z", recipients: 5, marked: 4, average: 40, below: 3 }, { id: "a2", title: "Decimals", at: "2026-10-15T20:59:00Z", recipients: 5, marked: 1, average: 90, below: 0 }],
  recent: [{ id: "s1", title: "Algebra", startedAt: "2026-10-29T10:00:00Z", finalized: false, attended: 4, counted: 5 }] };

it("opens the actual work", () => {
  render(<HomeView name="Mostafa Mones" academyName="Academy" base="/a" live={read([])} overview={read(data)} />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Welcome back, Mostafa");
  expect(screen.getByRole("link", { name: /Loops/ }).getAttribute("href")).toBe("/a/content/u");
  expect(screen.queryByRole("button", { name: /Start session/ })).toBeNull();
});
it("does not claim all caught up or zero students after a failed overview read", () => {
  render(<HomeView academyName="Academy" base="/a" live={read([])} overview={{...read(data),data:undefined,error:new Error("Connection lost")}} />);
  expect(screen.getByText("Couldn’t load academy overview")).toBeTruthy();
  expect(screen.queryByText("All caught up")).toBeNull();
  expect(screen.queryByText("Active students")).toBeNull();
});
it("does not lose the overview when live sessions fail", () => {
  render(<HomeView academyName="Academy" base="/a" overview={read(data)} live={{...read([]),data:undefined,error:new Error("Connection lost")}} />);
  expect(screen.getByRole("link",{name:/Loops/})).toBeTruthy();
  expect(screen.getByText("Couldn’t load live sessions")).toBeTruthy();
});
it("compares the last four weeks with the four before and links students to watch", () => {
  render(<HomeView academyName="Academy" base="/a" live={read([])} overview={read(dashboard)} />);
  expect(screen.getByText("90%")).toBeTruthy();
  expect(screen.getByText("+15 pts")).toBeTruthy();
  expect(screen.getByText("+4 new")).toBeTruthy();
  expect(screen.getByRole("img", { name: /Weekly combined performance: 60%, 42%/ })).toBeTruthy();
  expect(screen.getByText("42%")).toBeTruthy();
  expect(screen.getByText("-18 pts")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Nour Ali/ }).getAttribute("href")).toBe("/a/students/r1");
  expect(screen.getByRole("link", { name: /Algebra/ }).getAttribute("href")).toBe("/a/attendance/s1");
  expect(screen.getByText("Draft")).toBeTruthy();
  expect(screen.getAllByText("50%")).toHaveLength(2); // panel and tile, marked-weighted: (40×4 + 90×1) / 5
  expect(screen.getByText("3 below 50%")).toBeTruthy();
});
it("never shows a rate without finalized marks, and hides sections the server did not report", () => {
  expect(rate([{attended: 3, counted: 4}, {attended: 0, counted: 0}, {attended: 5, counted: 6}])).toBe(80);
  expect(rate([{attended: 0, counted: 0}])).toBeNull();
  render(<HomeView academyName="Academy" base="/a" live={read([])} overview={read({ ...data, attendance: [week("2026-11-16")] })} />);
  expect(screen.getByText("No finalized sessions in the last 8 weeks")).toBeTruthy();
  expect(screen.queryByText("Students to watch")).toBeNull();
  cleanup();
  render(<HomeView academyName="Academy" base="/a" live={read([])} overview={read(data)} />);
  expect(screen.queryByText("Attendance")).toBeNull();
  cleanup();
  render(<HomeView academyName="Academy" base="/a" live={read([])} overview={read({ ...data, attentionCount: 0, attention: [] })} />);
  expect(screen.queryByText("Alerts")).toBeNull();
});
