// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContentDetail } from "../data";

const actions = vi.hoisted(() => ({ loadUnit: vi.fn(), loadUnitPanels: vi.fn(), saveUnit: vi.fn(), changeUnit: vi.fn(), publishUnitEdits: vi.fn() }));
vi.mock("../actions", () => actions);
vi.mock("../media-actions", () => ({ refreshVideo: vi.fn() }));
vi.mock("@/modules/auth", () => ({ AcademyGate: ({ children }: { children: (academy: { id: string }) => ReactNode }) => children({ id: "academy" }) }));
vi.mock("@/modules/navigation", () => ({ useCanonicalHref: () => (href: string) => href }));
vi.mock("@/components/shared/breadcrumb-title", () => ({ useBreadcrumbTitle: vi.fn() }));
vi.mock("@/components/shared/header-actions", () => ({ HeaderActions: ({ children }: { children: ReactNode }) => children }));
const upload = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("./uploader", () => ({ MaterialUploader: () => null, TILE: "", TileIcon: () => null, isVideo: (file: File) => file.type.startsWith("video/"),
  useMaterialUpload: () => ({ busy: false, progress: 0, error: "", pending: null, start: upload.start, retry: vi.fn() }) }));
vi.mock("./preview", () => ({ MaterialPreview: () => null, ACTION: "" }));
vi.mock("./assessment-picker", () => ({ AssessmentPicker: () => null }));
vi.mock("./reuse", () => ({ ReuseMaterial: () => null }));
vi.mock("./uploads", () => ({ UploadedFiles: () => null }));
vi.mock("../access/manager", () => ({ UnitAccessPanel: () => null }));
vi.mock("../requirements/editor", () => ({ UnitRequirements: () => null }));

import { ContentEditorPage } from "./editor";

function detail(): ContentDetail {
  return {
    unit: { id: "unit", academy_id: "academy", program_id: "program", created_by: "author", updated_at: "2026-10-21T00:00:00Z", version: 5,
      state: "published", published_revision: 1, published_version: 5, review_requested_at: null,
      draft: { title: "Revision", description: "", accessDays: 7, items: [] } },
    program: { academic_years: { start_year: 2026, closed_at: null } }, programLabel: "First Secondary",
    assets: [], feedback: [], revisions: [], userId: "author", manager: false,
  } as unknown as ContentDetail;
}

function open(data: ContentDetail) {
  actions.loadUnit.mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ContentEditorPage unitId="unit" /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no ResizeObserver; the floating history sheet observes the sidebar inset.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  actions.saveUnit.mockResolvedValue({ ok: true, value: undefined });
  actions.changeUnit.mockResolvedValue({ ok: true, value: undefined });
  actions.publishUnitEdits.mockResolvedValue({ ok: true, value: undefined });
  actions.loadUnitPanels.mockResolvedValue({ history: { ok: true, value: { drafts: [], revisions: [] } }, assessments: { ok: true, value: [] }, sources: { ok: true, value: [] } });
});
afterEach(cleanup);
async function selectTab(name: string | RegExp) {
  const tab = await screen.findByRole("tab", { name });
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
  fireEvent.click(tab);
}

describe("published unit maintenance", () => {
  it("starts loading panel data without blocking the unit or waiting for a panel to open", async () => {
    actions.loadUnitPanels.mockReturnValue(new Promise(() => {}));
    open(detail());
    expect(await screen.findByRole("heading", { name: "Revision" })).toBeTruthy();
    await waitFor(() => expect(actions.loadUnitPanels).toHaveBeenCalledWith("academy", "unit"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("publishes unsaved manager edits in one action without a separate draft save", async () => {
    open({ ...detail(), userId: "manager", manager: true });
    await selectTab("Settings");
    fireEvent.change(await screen.findByLabelText("Title"), { target: { value: "Updated lesson" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish changes" }));
    await waitFor(() => expect(actions.publishUnitEdits).toHaveBeenCalledWith(expect.objectContaining({ version: 5, document: expect.objectContaining({ title: "Updated lesson" }) })));
    expect(actions.saveUnit).not.toHaveBeenCalled();
    expect(actions.changeUnit).not.toHaveBeenCalled();
  });
  it("keeps local edits when publication fails", async () => {
    actions.publishUnitEdits.mockResolvedValue({ ok: false, message: "Video is still processing." });
    open({ ...detail(), userId: "manager", manager: true });
    await selectTab("Settings");
    fireEvent.change(await screen.findByLabelText("Title"), { target: { value: "Keep this edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish changes" }));
    await screen.findByText("Video is still processing.");
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Keep this edit");
    expect(actions.saveUnit).not.toHaveBeenCalled();
    expect(actions.loadUnit).toHaveBeenCalledTimes(1);
  });
  it("publishes an already saved draft through the existing publication action", async () => {
    open({ ...detail(), userId: "manager", manager: true });
    fireEvent.click(await screen.findByRole("button", { name: "Publish changes" }));
    await waitFor(() => expect(actions.changeUnit).toHaveBeenCalledWith(expect.objectContaining({ version: 5, action: "publish" })));
    expect(actions.publishUnitEdits).not.toHaveBeenCalled();
  });
  it("lets the author change duration in the draft without offering publication", async () => {
    const data = detail(); data.unit.draft.accessDays = 44;
    open(data);
    await selectTab("Settings");
    const duration = await screen.findByLabelText("Access duration (days)");
    expect((duration as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Publish changes" })).toBeNull();
    fireEvent.change(duration, { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(actions.saveUnit).toHaveBeenCalledWith(expect.objectContaining({ version: 5, document: expect.objectContaining({ accessDays: 45 }) })));
  });

  it("lets the author submit an already published unit for review", async () => {
    open(detail());
    fireEvent.click(await screen.findByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(actions.changeUnit).toHaveBeenCalledWith(expect.objectContaining({ unitId: "unit", version: 5, action: "submit" })));
  });

  it("keeps another instructor's unit read-only", async () => {
    open({ ...detail(), userId: "other-instructor" });
    await selectTab("Settings");
    const duration = await screen.findByLabelText("Access duration");
    expect((duration as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit for review" })).toBeNull();
  });

  it("keeps an author's closed-year unit read-only", async () => {
    const data = detail();
    data.program.academic_years.closed_at = "2026-10-21T00:00:00Z";
    open(data);
    await selectTab("Settings");
    expect((await screen.findByLabelText("Access duration") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Submit for review" })).toBeNull();
  });

  it("lets a manager request changes to published material without publishing it", async () => {
    open({ ...detail(), userId: "manager", manager: true });
    await selectTab(/^Review/);
    fireEvent.change(await screen.findByLabelText("Feedback"), { target: { value: "Please check the revision." } });
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    await waitFor(() => expect(actions.changeUnit).toHaveBeenCalledWith(expect.objectContaining({ action: "request_changes", feedback: "Please check the revision." })));
    expect(screen.getByRole("button", { name: "Publish changes" })).toBeTruthy();
  });

  describe("answers dropped on an assessment", () => {
    const assessment = { id: "00000000-0000-4000-8000-000000000001", kind: "assessment" as const, title: "Homework", assessmentKind: "assignment" as const, assessmentId: "00000000-0000-4000-8000-000000000002" };
    const video = { id: "00000000-0000-4000-8000-000000000003", kind: "explanation" as const, title: "Walkthrough", assetId: "00000000-0000-4000-8000-000000000004" };
    function withItems() { const data = detail(); data.unit.draft.items = [video, assessment]; return data; }
    const row = (title: string) => screen.getByDisplayValue(title).closest("[draggable]")!;
    const internal = { types: ["text/plain"], files: [], setData: () => {} };

    it("turns a dragged material into the assessment's answer in the draft, without a prompt", async () => {
      open(withItems());
      await screen.findByDisplayValue("Homework");
      fireEvent.dragStart(row("Walkthrough"), { dataTransfer: internal });
      fireEvent.drop(row("Homework"), { dataTransfer: internal });
      expect(await screen.findByRole("list", { name: "Answers for Homework" })).toBeTruthy();
      expect(screen.queryByRole("alertdialog")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
      await waitFor(() => expect(actions.saveUnit).toHaveBeenCalledWith(expect.objectContaining({ document: expect.objectContaining({
        items: [assessment, { ...video, kind: "answer", assessmentKind: "assignment", assessmentId: assessment.assessmentId }] }) })));
    });

    it("moves the selected material with the arrow keys and offers its controls in the bar", async () => {
      open(withItems());
      await screen.findByDisplayValue("Homework");
      fireEvent.pointerDown(row("Walkthrough"));
      const bar = await screen.findByRole("region", { name: "Selected material" });
      expect(bar.textContent).toContain("Explanation video");
      fireEvent.keyDown(document.body, { key: "ArrowDown" });
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(screen.queryByRole("region", { name: "Selected material" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
      await waitFor(() => expect(actions.saveUnit).toHaveBeenCalledWith(expect.objectContaining({ document: expect.objectContaining({ items: [assessment, video] }) })));
    });

    it("uploads a dropped document straight away as the assessment's answer", async () => {
      open(withItems());
      await screen.findByDisplayValue("Homework");
      const file = new File(["%PDF"], "Solutions.pdf", { type: "application/pdf" });
      fireEvent.drop(row("Homework"), { dataTransfer: { files: [file], types: ["Files"] } });
      expect(upload.start).toHaveBeenCalledWith(file, assessment);
    });
  });
});
