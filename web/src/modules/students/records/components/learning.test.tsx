// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ learning: vi.fn(), materials: vi.fn() }));
vi.mock("@/modules/content", () => ({ loadStaffStudentLearning: api.learning, loadStaffUnitMaterials: api.materials }));
vi.mock("@/modules/attendance", () => ({ loadStudentAttendance: vi.fn() }));
vi.mock("@/modules/assessments", () => ({ loadStudentAssessments: vi.fn() }));
import { studentLearningOptions, type StudentLearningData } from "../overview";
import { StudentLearning } from "./learning";

const data = (offset: number, record = "student"): StudentLearningData => ({
  total: 25, started: 0, completed: 0,
  units: Array.from({ length: offset ? 1 : 24 }, (_, index) => ({
    id: record + "-" + (offset + index), title: record + " unit " + (offset + index),
    access: { status: "locked", expiresAt: null, grantId: null }, progress: { total: 1, completed: 0, items: [] },
  })),
});
beforeEach(() => {
  vi.clearAllMocks();
  api.learning.mockImplementation((_academy, record, offset) => Promise.resolve(data(offset, record)));
});
afterEach(cleanup);

function Record({ recordId, placement = "" }: { recordId: string; placement?: string }) {
  const query = useQuery(studentLearningOptions("academy", recordId, 0, placement));
  return <StudentLearning key={placement} academyId="academy" recordId={recordId} placement={placement} query={query} base="/academy" />;
}

it("expands cached units without another read and fetches only the requested next page", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Record recordId="student" /></QueryClientProvider>);
  await screen.findByRole("heading", { name: "student unit 0" });
  expect(screen.queryByRole("heading", { name: "student unit 2" })).toBeNull();
  expect(api.learning).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "View all" }));
  expect(await screen.findByRole("heading", { name: "student unit 23" })).toBeTruthy();
  expect(api.learning).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: "student unit 24" });
  expect(api.learning).toHaveBeenLastCalledWith("academy", "student", 24, expect.any(AbortSignal));
  fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
  await screen.findByRole("heading", { name: "student unit 0" });
  expect(api.learning).toHaveBeenCalledTimes(2);
  client.clear();
});

it("does not retain the previous student's expanded units after changing records", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (id: string) => <QueryClientProvider client={client}><Record key={id} recordId={id} /></QueryClientProvider>;
  const view = render(tree("first"));
  await screen.findByRole("heading", { name: "first unit 0" });
  fireEvent.click(screen.getByRole("button", { name: "View all" }));
  view.rerender(tree("second"));
  await screen.findByRole("heading", { name: "second unit 0" });
  await waitFor(() => expect(screen.queryByRole("heading", { name: "first unit 0" })).toBeNull());
  expect(screen.queryByRole("heading", { name: "second unit 23" })).toBeNull();
  client.clear();
});

it("revalidates eligibility and resets paging when the same student's placement changes", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (placement: string) => <QueryClientProvider client={client}><Record recordId="student" placement={placement} /></QueryClientProvider>;
  const view = render(tree("old-track"));
  await screen.findByRole("heading", { name: "student unit 0" });
  fireEvent.click(screen.getByRole("button", { name: "View all" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: "student unit 24" });
  api.learning.mockImplementation((_academy, _record, offset) => Promise.resolve(data(offset, "new-track")));
  view.rerender(tree("new-track"));
  await screen.findByRole("heading", { name: "new-track unit 0" });
  expect(screen.queryByRole("heading", { name: "student unit 24" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  expect(api.learning).toHaveBeenLastCalledWith("academy", "student", 0, expect.any(AbortSignal));
  client.clear();
});

it("searches and filters the loaded page without another read and recovers from no results", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Record recordId="student" /></QueryClientProvider>);
  await screen.findByRole("heading", { name: "student unit 0" });
  fireEvent.change(screen.getByRole("textbox", { name: "Search loaded units" }), { target: { value: "unit 23" } });
  expect(screen.getByRole("heading", { name: "student unit 23" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Available\s*0/ }));
  expect(screen.getByText("No matching units")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "student unit 23" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByRole("heading", { name: "student unit 0" })).toBeTruthy();
  expect(api.learning).toHaveBeenCalledTimes(1);
  client.clear();
});

it("loads named progress only on expansion, preserves expired completion and reuses the material cache", async () => {
  const itemId = "c25cbb89-7bbf-49dd-af25-70afdc5903ac";
  api.learning.mockResolvedValue({ total: 1, started: 1, completed: 1, units: [{ id: "unit", title: "Finished unit", access: { status: "expired", expiresAt: "2026-10-28T12:00:00Z", grantId: null }, progress: { total: 1, completed: 1, items: [{ itemId, completed: true, watchedSeconds: 90, durationSeconds: 100 }] } }] });
  api.materials.mockResolvedValue([{ id: itemId, title: "Variables", kind: "explanation" }]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Record recordId="student" /></QueryClientProvider>);
  await screen.findByRole("heading", { name: "Finished unit" });
  expect(screen.getByText("1 of 1 units completed")).toBeTruthy();
  expect(screen.getAllByText("Expired").length).toBeGreaterThan(0);
  expect(api.materials).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "View progress: Finished unit" }));
  await screen.findByText("Variables");
  expect(screen.getByText("Completed")).toBeTruthy();
  expect(api.materials).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Hide progress: Finished unit" }));
  fireEvent.click(screen.getByRole("button", { name: "View progress: Finished unit" }));
  await screen.findByText("Variables");
  expect(api.materials).toHaveBeenCalledTimes(1);
  expect(api.learning).toHaveBeenCalledTimes(1);
  client.clear();
});

it("shows every unit in a small catalog without a redundant View all action", async () => {
  api.learning.mockResolvedValue({ ...data(0), total: 3, units: data(0).units.slice(0, 3) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Record recordId="student" /></QueryClientProvider>);
  await screen.findByRole("heading", { name: "student unit 2" });
  expect(screen.queryByRole("button", { name: "View all" })).toBeNull();
  expect(api.learning).toHaveBeenCalledTimes(1);
  client.clear();
});

it("replaces an empty catalog without zero-value filters or completion controls", async () => {
  api.learning.mockResolvedValue({ total: 0, started: 0, completed: 0, units: [] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Record recordId="student" /></QueryClientProvider>);
  await screen.findByText("No published units for this placement");
  expect(screen.queryByRole("group", { name: "Unit access filters" })).toBeNull();
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  client.clear();
});
