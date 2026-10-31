// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ContentDetail } from "../data";
import type { UnitSheetTab } from "./menu";

const actions = vi.hoisted(() => ({ loadUnit: vi.fn(), loadUnitPanels: vi.fn(), saveUnit: vi.fn(), saveUnitVersion: vi.fn(), changeUnit: vi.fn() }));
vi.mock("../actions", () => actions);
vi.mock("../media-actions", () => ({ refreshVideo: vi.fn() }));
vi.mock("@/modules/navigation", () => ({ useCanonicalHref: () => (href: string) => href }));
vi.mock("./preview", () => ({ MaterialPreview: () => <button>Preview</button>, ACTION: "" }));
vi.mock("../requirements/editor", () => ({ UnitRequirements: () => null }));

import { UnitSheet } from "./sheet";

const item = { id: "11111111-1111-4111-8111-111111111111", kind: "explanation", title: "Lesson one", assetId: "22222222-2222-4222-8222-222222222222" };
function detail(overrides: Partial<ContentDetail> = {}): ContentDetail {
  return {
    unit: { id: "unit", created_by: "author", version: 5, state: "draft", published_revision: 0, draft: { title: "Revision", description: "", accessDays: 7, items: [item] } },
    program: { academic_years: { start_year: 2026, closed_at: null } }, programLabel: "First Secondary",
    assets: [{ id: item.assetId, kind: "video", status: "ready" }], feedback: [], revisions: [], userId: "author", manager: false, ...overrides,
  } as unknown as ContentDetail;
}
const onClose = vi.fn(), onArchive = vi.fn();
function open(data: ContentDetail, tab: UnitSheetTab = "edit") {
  actions.loadUnit.mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><TooltipProvider><UnitSheet academyId="academy" unitId="unit" tab={tab} opener={null} onClose={onClose} onArchive={onArchive} /></TooltipProvider></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  actions.saveUnit.mockResolvedValue({ ok: true, value: undefined });
  actions.saveUnitVersion.mockResolvedValue({ ok: true, value: undefined });
  actions.changeUnit.mockResolvedValue({ ok: true, value: undefined });
  actions.loadUnitPanels.mockResolvedValue({ history: { ok: true, value: { drafts: [], revisions: [] } } });
});
afterEach(cleanup);

it("saves pending settings on close, then closes", async () => {
  open(detail());
  fireEvent.change(await screen.findByLabelText("Title"), { target: { value: "Renamed" } });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(actions.saveUnit).toHaveBeenCalledWith(expect.objectContaining({ version: 5, document: expect.objectContaining({ title: "Renamed" }) }));
});

it("keeps the sheet open and asks before dropping a draft that can't be saved", async () => {
  open(detail());
  fireEvent.change(await screen.findByLabelText("Title"), { target: { value: " " } });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(await screen.findByRole("alertdialog")).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
  expect(actions.saveUnit).not.toHaveBeenCalled();
});

it("shows read-only settings without saving when the year is closed", async () => {
  open(detail({ program: { academic_years: { start_year: 2026, closed_at: "2026-06-01" } } } as Partial<ContentDetail>));
  expect((await screen.findByLabelText("Title") as HTMLInputElement).disabled).toBe(true);
  expect(screen.queryByRole("button", { name: "Archive unit" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(actions.saveUnit).not.toHaveBeenCalled();
});

it("hands archiving to the library for a manager", async () => {
  const data = detail({ manager: true });
  open(data);
  fireEvent.click(await screen.findByRole("button", { name: "Archive unit" }));
  expect(onArchive).toHaveBeenCalledWith(data.unit);
});

it("shows material without any way to edit it", async () => {
  open(detail(), "content");
  const title = await screen.findByLabelText("Material title") as HTMLInputElement;
  expect(title.value).toBe("Lesson one");
  expect(title.disabled).toBe(true);
  expect(title.closest("[draggable]")).toBeNull();
  expect(screen.getByRole("button", { name: "Preview" })).toBeTruthy();
});

it("loads history only from its tab", async () => {
  open(detail());
  await screen.findByLabelText("Title");
  expect(actions.loadUnitPanels).not.toHaveBeenCalled();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "History" }));
  await waitFor(() => expect(actions.loadUnitPanels).toHaveBeenCalledWith("academy", "unit"));
  expect(await screen.findByText("No history yet.")).toBeTruthy();
});

const draftHistory = (document: unknown) => actions.loadUnitPanels.mockResolvedValue({ history: { ok: true, value: { drafts: [{ kind: "created", document, at: "2026-10-01T00:00:00Z", by: { id: "author", name: "Mona" } }], revisions: [] } } });

it("offers saving a version from History until the unit is first published", async () => {
  draftHistory(detail().unit.draft);
  open(detail({ manager: true }), "history");
  fireEvent.click(await screen.findByRole("button", { name: "Save version" }));
  await waitFor(() => expect(actions.saveUnitVersion).toHaveBeenCalledWith({ academyId: "academy", unitId: "unit", version: 5 }));
  expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
});

it("offers publishing edits from History once the unit is published", async () => {
  draftHistory(detail().unit.draft);
  const base = detail({ manager: true });
  open({ ...base, unit: { ...base.unit, state: "published", published_revision: 1 }, revisions: [{ revision: 1, document: { ...base.unit.draft, title: "Live" } }] } as unknown as ContentDetail, "history");
  fireEvent.click(await screen.findByRole("button", { name: "Publish" }));
  await waitFor(() => expect(actions.changeUnit).toHaveBeenCalledWith({ academyId: "academy", unitId: "unit", version: 5, action: "publish" }));
  expect(screen.queryByRole("button", { name: "Save version" })).toBeNull();
});

it("slides a tab in from the side it sits on", async () => {
  open(detail(), "history");
  await screen.findByRole("tabpanel", { name: "History" });
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Content" }));
  expect(screen.getByRole("tabpanel", { name: "Content" }).className).toContain("slide-in-from-right-8");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Edit" }));
  expect(screen.getByRole("tabpanel", { name: "Edit" }).className).toContain("slide-in-from-left-8");
});
