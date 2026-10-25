// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ loadUnitPanels: vi.fn(), reuseMaterial: vi.fn(), createAttachedAssessment: vi.fn() }));
vi.mock("./actions", () => api);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/modules/navigation", () => ({ useCanonicalHref: () => (path: string) => path }));

import { unitPanelOptions } from "./panels";
import { AssessmentPicker } from "./components/assessment-picker";
import { ReuseMaterial } from "./components/reuse";
import { VersionHistory } from "./components/history";

const result = () => ({
  history: { ok: true as const, value: { drafts: [], revisions: [] } },
  assessments: { ok: true as const, value: [{ id: "homework", title: "Homework", kind: "assignment" as const }] },
  sources: { ok: true as const, value: [{ id: "previous", title: "Previous lesson", items: [{ id: "notes", kind: "document" as const, title: "Published notes", assetId: "asset" }] }] },
});

beforeEach(() => {
  vi.clearAllMocks();
  api.loadUnitPanels.mockResolvedValue(result());
  api.reuseMaterial.mockResolvedValue({ ok: true, value: undefined });
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  HTMLElement.prototype.scrollIntoView ??= vi.fn();
});
afterEach(cleanup);

function mount(client: QueryClient) {
  render(<QueryClientProvider client={client}>
    <VersionHistory academyId="academy" unitId="unit" userId="author" live disabled={false} />
    <ReuseMaterial academyId="academy" unitId="unit" version={1} disabled={false} onChange={async () => {}} />
    <AssessmentPicker academyId="academy" unitId="unit" version={1} items={[]} dirty={false} disabled={false} onAdd={() => {}} onCreated={async () => {}} />
  </QueryClientProvider>);
}

it("opens history and assessment options from the background cache without another request", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await client.prefetchQuery(unitPanelOptions("academy", "unit"));
  mount(client);
  expect((screen.getByRole("combobox", { name: "Assessment" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "History" }));
  expect(await screen.findByText("No history yet.")).toBeTruthy();
  expect(screen.queryByRole("status", { name: "Loading history" })).toBeNull();
  expect(api.loadUnitPanels).toHaveBeenCalledTimes(1);
});

it("selects published material without fetching the source unit", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await client.prefetchQuery(unitPanelOptions("academy", "unit"));
  mount(client);
  fireEvent.click(screen.getByRole("button", { name: "Reuse material" }));
  fireEvent.click(await screen.findByRole("combobox", { name: "Published unit" }));
  fireEvent.click(await screen.findByRole("option", { name: "Previous lesson" }));
  fireEvent.click(screen.getByRole("combobox", { name: "Material" }));
  fireEvent.click(await screen.findByRole("option", { name: "Document · Published notes" }));
  fireEvent.click(screen.getByRole("button", { name: "Copy material" }));
  await waitFor(() => expect(api.reuseMaterial).toHaveBeenCalledWith({ academyId: "academy", unitId: "unit", version: 1, sourceId: "previous", itemId: "notes" }));
  expect(api.loadUnitPanels).toHaveBeenCalledTimes(1);
});

it("refreshes cached options after content invalidation", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await client.prefetchQuery(unitPanelOptions("academy", "unit"));
  mount(client);
  api.loadUnitPanels.mockResolvedValue({ ...result(), assessments: { ok: true, value: [] } });
  await act(() => client.invalidateQueries({ queryKey: ["content", "academy"] }));
  await screen.findByText("No compatible assessments");
  expect(api.loadUnitPanels).toHaveBeenCalledTimes(2);
});

it("keeps assessments usable if history fails and retries the failed panel", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.loadUnitPanels.mockResolvedValue({ ...result(), history: { ok: false, message: "Could not load history." } });
  await client.prefetchQuery(unitPanelOptions("academy", "unit"));
  mount(client);
  expect((screen.getByRole("combobox", { name: "Assessment" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "History" }));
  await screen.findByText("Could not load history.");
  api.loadUnitPanels.mockResolvedValue(result());
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("No history yet.")).toBeTruthy();
});
