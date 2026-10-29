// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HomeView } from "./view";
import type { Overview } from "./overview";
afterEach(cleanup);
const read = <T,>(data: T) => ({ data, error: null, isPending: false, isFetching: false, refetch: vi.fn(async () => {}) });
const data: Overview = { year: 2026, asOf: "2026-10-29T12:00:00Z", attentionCount: 1,
  students: { total: 20, online: 5, levels: [{id: "secondary-2", name: "Secondary", total: 20, online: 5}] },
  attention: [{kind: "review", id: "u", title: "Loops", amount: 1}], today: [] };
it("opens the actual work and filters student destinations without repeating sidebar navigation", () => {
  render(<HomeView academyName="Academy" base="/a" live={read([])} overview={read(data)} />);
  expect(screen.getByRole("link", { name: /Loops/ }).getAttribute("href")).toBe("/a/content/u");
  expect(screen.getByRole("link", { name: /View online students/ }).getAttribute("href")).toBe("/a/students?type=online_only");
  expect(screen.getByText("15 in person · 5 online")).toBeTruthy();
  expect(screen.queryByRole("navigation", { name: "Academy workspace" })).toBeNull();
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
