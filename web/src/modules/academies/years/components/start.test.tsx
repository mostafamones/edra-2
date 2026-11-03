// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { advanceBrowserScope } from "@/lib/browser-scope";
import type { YearLearning } from "../types";

const api = vi.hoisted(() => ({ read: vi.fn(), start: vi.fn() }));
vi.mock("../actions", () => ({ getYearLearning: api.read, startYearLearning: api.start }));
vi.mock("@/modules/auth/components/provider", () => ({ useAuth: () => ({ activeAcademy: { id: "academy" }, user: { id: "actor" } }) }));
import { YearLearningSettings } from "./start";

const key = ["year-learning", "academy"];
const otherKey = ["year-learning", "other"];
const initial: YearLearning = { year: { id: "year", startYear: 2026, startedAt: null }, canManage: true };
const started: YearLearning = { ...initial, year: { ...initial.year!, startedAt: "2026-11-02T10:00:00Z" } };
const clients: QueryClient[] = [];

afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.clearAllMocks(); });

async function beginStart() {
  let resolve!: (value: { ok: true; value: YearLearning }) => void;
  api.start.mockReturnValue(new Promise(done => { resolve = done; }));
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
  clients.push(client);
  client.setQueryData(key, initial);
  client.setQueryData(otherKey, initial);
  const view = render(<QueryClientProvider client={client}><YearLearningSettings /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Start year" }));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Start year" }));
  await waitFor(() => expect(api.start).toHaveBeenCalledWith("academy", "year"));
  return { client, view, finish: () => act(async () => { resolve({ ok: true, value: started }); }) };
}

it("invalidates only the captured academy when a successful start finishes after leaving", async () => {
  const { client, view, finish } = await beginStart();
  view.unmount();
  await finish();
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(client.getQueryData(key)).toEqual(initial);
  expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);
});

it("does not recreate an old account's entry after its cache is cleared", async () => {
  const { client, view, finish } = await beginStart();
  view.unmount();
  advanceBrowserScope();
  client.clear();
  client.setQueryData(otherKey, { account: "next" });
  await finish();
  expect(client.getQueryData(key)).toBeUndefined();
  expect(client.getQueryData(otherKey)).toEqual({ account: "next" });
  expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);
});

it("uses the authoritative success response while the original view is current", async () => {
  const { client, finish } = await beginStart();
  await finish();
  await screen.findByText("Started");
  expect(client.getQueryData(key)).toEqual(started);
  expect(api.read).not.toHaveBeenCalled();
});
