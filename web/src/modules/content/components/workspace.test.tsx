// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";

const mocks = vi.hoisted(() => ({ loadWorkspace: vi.fn(), setUnitLabel: vi.fn() }));
vi.mock("../actions", () => ({ loadWorkspace: mocks.loadWorkspace, changeUnit: vi.fn(), createUnit: vi.fn(), copyUnit: vi.fn() }));
vi.mock("../labels", () => ({ setUnitLabel: mocks.setUnitLabel }));
vi.mock("@/modules/auth", () => ({ AcademyGate: ({ children }: { children: (academy: object) => ReactNode }) => children({ id: "academy", role: "owner" }), useAcademyScope: () => () => true }));
vi.mock("@/modules/navigation", () => ({ useCanonicalHref: () => (href: string) => href }));
vi.mock("@/lib/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/modules/labels", () => ({ canManageLabels: () => false, LabelManager: () => null, LabelOverflow: () => null, labelsQueryKey: () => ["labels"], useLabels: () => ({ data: [] }) }));
vi.mock("@/components/shared/header-actions", () => ({ HeaderActions: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/shared/link", () => ({ default: ({ children }: { children: ReactNode }) => <span>{children}</span> }));
vi.mock("./menu", () => ({ UnitMenu: ({ children }: { children: ReactNode }) => children, UnitActions: ({ unit, actions }: { unit: object; actions: { onApplyLabel: (unit: object, label: string, applied: boolean) => void } }) => <><button onClick={() => actions.onApplyLabel(unit, "label", true)}>Apply</button><button onClick={() => actions.onApplyLabel(unit, "label", false)}>Remove</button></> }));
vi.mock("./sheet", () => ({ UnitSheet: () => null }));
import { ContentWorkspacePage } from "./workspace";

const workspaceData = () => ({ years: [{ id: "year", start_year: 2026, closed_at: null }], levels: [], tracks: [], levelNames: {}, programs: [{ id: "program", academic_year_id: "year", level_id: "level", track_id: null }], trackYearLabels: [], historicalTracks: [], labelIds: { unit: [] as string[] }, units: [{ id: "unit", program_id: "program", state: "draft", updated_at: "2026-01-01", draft: { title: "Unit", description: "", items: [] } }] });

afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("orders opposite label clicks and keeps the newer optimistic value after an older failure", async () => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  let first!: (value: unknown) => void, second!: (value: unknown) => void;
  mocks.setUnitLabel.mockReturnValueOnce(new Promise(resolve => { first = resolve; })).mockReturnValueOnce(new Promise(resolve => { second = resolve; }));
  const data = workspaceData();
  mocks.loadWorkspace.mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  render(<QueryClientProvider client={client}><TooltipProvider><ContentWorkspacePage /></TooltipProvider></QueryClientProvider>);
  await screen.findByText("Unit");
  fireEvent.click(screen.getByText("Apply"));
  fireEvent.click(screen.getByText("Remove"));
  await waitFor(() => expect(mocks.setUnitLabel).toHaveBeenCalledTimes(1));
  expect(mocks.setUnitLabel.mock.calls[0][0].applied).toBe(true);
  await waitFor(() => expect((client.getQueryData(["content", "academy", "workspace"]) as typeof data).labelIds.unit).toEqual([]));
  await act(async () => first({ ok: false, code: "failure", message: "Failed" }));
  await waitFor(() => expect(mocks.setUnitLabel).toHaveBeenCalledTimes(2));
  expect(mocks.setUnitLabel.mock.calls[1][0].applied).toBe(false);
  expect((client.getQueryData(["content", "academy", "workspace"]) as typeof data).labelIds.unit).toEqual([]);
  await act(async () => second({ ok: true, labelIds: [] }));
});

it("does not roll a cleared and recreated workspace back from an old request", async () => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  let finish!: (value: unknown) => void;
  mocks.setUnitLabel.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const data = workspaceData();
  mocks.loadWorkspace.mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  render(<QueryClientProvider client={client}><TooltipProvider><ContentWorkspacePage /></TooltipProvider></QueryClientProvider>);
  await screen.findByText("Unit");
  fireEvent.click(screen.getByText("Apply"));
  await waitFor(() => expect(mocks.setUnitLabel).toHaveBeenCalledTimes(1));
  await act(async () => { client.clear(); client.setQueryData(["content", "academy", "workspace"], { ...data, labelIds: { unit: ["label"] } }); });
  await act(async () => finish({ ok: false, code: "failure", message: "Failed" }));
  expect((client.getQueryData(["content", "academy", "workspace"]) as typeof data).labelIds.unit).toEqual(["label"]);
});
