// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { academyDateTime } from "@/lib/academy-time";
import type { UnitPublication } from "../data";

const api = vi.hoisted(() => ({ loadUnitPublication: vi.fn(), loadUnitPanels: vi.fn(), scheduleUnitPublication: vi.fn(), cancelUnitPublication: vi.fn() }));
const scope = vi.hoisted(() => ({ current: true }));
vi.mock("../actions", () => api);
vi.mock("@/modules/assessments", () => ({ AssessmentDateTime: ({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) => <input id={id} aria-label="Publish at" value={value} onChange={e => onChange(e.target.value)} /> }));
vi.mock("@/modules/auth", () => ({ useAcademyScope: () => () => scope.current }));

import { PublicationButton, usePublication } from "./publication";

const FUTURE = "2099-06-01T09:00:00.000Z";
const candidate = { unitVersion: 5 };
const pending = { generation: 3, state: "pending" as const, scheduledFor: FUTURE, nextAttemptAt: FUTURE, reason: null };

function Harness({ dirty = false, enabled = true, userId = "user" }) {
  const query = usePublication({ academyId: "academy", unitId: "unit", userId, enabled, dirty });
  const cache = useQueryClient();
  return <>
    <PublicationButton academyId="academy" unitId="unit" query={query} dirty={dirty} />
    <button onClick={() => void cache.invalidateQueries({ queryKey: ["content", "academy", "unit", "unit", "publication"] })}>Refresh</button>
  </>;
}
function open(value: Partial<UnitPublication>, props: Parameters<typeof Harness>[0] = {}) {
  api.loadUnitPublication.mockResolvedValue({ ok: true, value: { schedule: null, candidate: null, ...value } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(client, "invalidateQueries");
  const view = render(<QueryClientProvider client={client}><TooltipProvider><Harness {...props} /></TooltipProvider></QueryClientProvider>);
  return { client, spy, rerender: (next: Parameters<typeof Harness>[0]) => view.rerender(<QueryClientProvider client={client}><TooltipProvider><Harness {...next} /></TooltipProvider></QueryClientProvider>) };
}

beforeEach(() => {
  vi.clearAllMocks();
  scope.current = true;
  api.scheduleUnitPublication.mockResolvedValue({ ok: true, value: { state: "pending", generation: 1, scheduledFor: FUTURE } });
  api.cancelUnitPublication.mockResolvedValue({ ok: true, value: { state: "cancelled", generation: 4, scheduledFor: FUTURE } });
});
afterEach(cleanup);

const button = async (name: string | RegExp) => {
  const found = await screen.findByRole("button", { name });
  await waitFor(() => expect((found as HTMLButtonElement).disabled).toBe(false));
  return found;
};

it("schedules without a saved version, but not over unsaved edits", async () => {
  // The server saves the current draft as the version to publish.
  open({}, { dirty: true });
  fireEvent.click(await button("Schedule"));
  fireEvent.change(screen.getByLabelText("Publish at"), { target: { value: "2099-06-01T12:30" } });
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Saving…" }).disabled).toBe(true);
});

it("opens the schedule dialog directly and sends Cairo wall time with the generation it saw", async () => {
  open({ candidate });
  fireEvent.click(await button("Schedule"));
  fireEvent.change(screen.getByLabelText("Publish at"), { target: { value: "2099-06-01T12:30" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Schedule" }).at(-1)!);
  await waitFor(() => expect(api.scheduleUnitPublication).toHaveBeenCalledWith({ academyId: "academy", unitId: "unit", date: "2099-06-01", time: "12:30", generation: 0 }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeFalsy());
});

it("starts a new schedule a week from now", async () => {
  open({ candidate });
  fireEvent.click(await button("Schedule"));
  const week = academyDateTime(new Date(Date.now() + 7 * 86_400_000).toISOString()).date;
  expect((screen.getByLabelText("Publish at") as HTMLInputElement).value).toMatch(new RegExp(`^${week}T\\d{2}:\\d[05]$`));
});

it("rejects past and non-existent Cairo times before asking the server", async () => {
  open({ candidate });
  fireEvent.click(await button("Schedule"));
  fireEvent.change(screen.getByLabelText("Publish at"), { target: { value: "2020-01-01T10:00" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Schedule" }).at(-1)!);
  expect((await screen.findByRole("alert")).textContent).toBe("Choose a future time.");
  // Egypt's clocks skip this hour on the last Friday of April.
  fireEvent.change(screen.getByLabelText("Publish at"), { target: { value: "2099-04-24T00:30" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Schedule" }).at(-1)!);
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("That date or time doesn’t exist in Cairo time."));
  expect(api.scheduleUnitPublication).not.toHaveBeenCalled();
});

it("keeps the dialog open with the server's error and refreshes the schedule", async () => {
  api.scheduleUnitPublication.mockResolvedValue({ ok: false, message: "This schedule changed. Review it and try again." });
  open({ candidate, schedule: pending });
  fireEvent.click(await button(/^Scheduled/));
  expect((screen.getByLabelText("Publish at") as HTMLInputElement).value).toBe("2099-06-01T12:00");
  fireEvent.click(screen.getByRole("button", { name: "Reschedule" }));
  expect((await screen.findByRole("alert")).textContent).toContain("This schedule changed");
  expect(api.scheduleUnitPublication).toHaveBeenCalledWith(expect.objectContaining({ generation: 3 }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  await waitFor(() => expect(api.loadUnitPublication).toHaveBeenCalledTimes(2));
});

it("cancels from the dialog at the generation it saw", async () => {
  open({ candidate, schedule: pending });
  fireEvent.click(await button(/^Scheduled/));
  fireEvent.click(screen.getByRole("button", { name: "Cancel schedule" }));
  await waitFor(() => expect(api.cancelUnitPublication).toHaveBeenCalledWith({ academyId: "academy", unitId: "unit", generation: 3 }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeFalsy());
});

it("reports the publication when the worker won the race with a cancellation", async () => {
  api.cancelUnitPublication.mockResolvedValue({ ok: true, value: { state: "published", generation: 4, scheduledFor: FUTURE } });
  open({ candidate, schedule: pending });
  fireEvent.click(await button(/^Scheduled/));
  fireEvent.click(screen.getByRole("button", { name: "Cancel schedule" }));
  expect((await screen.findByRole("alert")).textContent).toContain("This schedule had already published.");
});

it("ignores a late result after the academy changed", async () => {
  open({ candidate, schedule: pending });
  fireEvent.click(await button(/^Scheduled/));
  scope.current = false;
  api.cancelUnitPublication.mockResolvedValue({ ok: false, message: "Late failure" });
  fireEvent.click(screen.getByRole("button", { name: "Cancel schedule" }));
  await waitFor(() => expect(api.cancelUnitPublication).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByRole<HTMLButtonElement>("button", { name: "Cancel schedule" }).disabled).toBe(false));
  expect(screen.queryByText("Late failure")).toBeFalsy();
});

it("shows a stopped schedule's reason and its recovery actions, even without a saved version", async () => {
  open({ schedule: { ...pending, state: "stopped", reason: "Wait until every attached upload is ready before publishing." } });
  fireEvent.click(await button("Publication stopped"));
  expect(screen.getByRole("dialog").textContent).toContain("Wait until every attached upload is ready");
  expect(screen.getByRole("button", { name: "Reschedule" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
});

it("doesn't read schedules for instructors", async () => {
  open({}, { enabled: false });
  await new Promise(resolve => setTimeout(resolve));
  expect(api.loadUnitPublication).not.toHaveBeenCalled();
});

it("reuses one read across consumers and separates accounts", async () => {
  const { rerender } = open({ candidate });
  await button("Schedule");
  expect(api.loadUnitPublication).toHaveBeenCalledTimes(1);
  rerender({ userId: "other" });
  await waitFor(() => expect(api.loadUnitPublication).toHaveBeenCalledTimes(2));
});

it("refreshes the unit once the worker finishes, but not over unsaved edits", async () => {
  const { spy, rerender } = open({ candidate, schedule: pending }, { dirty: true });
  await button(/^Scheduled/);
  api.loadUnitPublication.mockResolvedValue({ ok: true, value: { candidate, schedule: { ...pending, state: "published", nextAttemptAt: null } } });
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await button("Schedule");
  spy.mockClear();
  await new Promise(resolve => setTimeout(resolve));
  expect(spy).not.toHaveBeenCalledWith({ queryKey: ["content", "academy"] });
  rerender({ dirty: false });
  await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["content", "academy"] }));
});
