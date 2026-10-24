// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContentDetail } from "../data";

const actions = vi.hoisted(() => ({ loadUnit: vi.fn(), saveUnit: vi.fn(), changeUnit: vi.fn() }));
vi.mock("../actions", () => actions);
vi.mock("../media-actions", () => ({ refreshVideo: vi.fn() }));
vi.mock("@/modules/auth", () => ({ AcademyGate: ({ children }: { children: (academy: { id: string }) => ReactNode }) => children({ id: "academy" }) }));
vi.mock("@/modules/navigation", () => ({ useCanonicalHref: () => (href: string) => href }));
vi.mock("@/components/shared/breadcrumb-title", () => ({ useBreadcrumbTitle: vi.fn() }));
vi.mock("./uploader", () => ({ MaterialUploader: () => null }));
vi.mock("./preview", () => ({ MaterialPreview: () => null }));
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
  actions.saveUnit.mockResolvedValue({ ok: true, value: undefined });
  actions.changeUnit.mockResolvedValue({ ok: true, value: undefined });
});
afterEach(cleanup);

describe("published unit maintenance", () => {
  it("lets the author change duration in the draft without offering publication", async () => {
    open(detail());
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
    const duration = await screen.findByLabelText("Access duration (days)");
    expect((duration as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit for review" })).toBeNull();
  });

  it("keeps an author's closed-year unit read-only", async () => {
    const data = detail();
    data.program.academic_years.closed_at = "2026-10-21T00:00:00Z";
    open(data);
    expect((await screen.findByLabelText("Access duration (days)") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Submit for review" })).toBeNull();
  });

  it("lets a manager request changes to published material without publishing it", async () => {
    open({ ...detail(), userId: "manager", manager: true });
    fireEvent.change(await screen.findByLabelText("Feedback"), { target: { value: "Please check the revision." } });
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    await waitFor(() => expect(actions.changeUnit).toHaveBeenCalledWith(expect.objectContaining({ action: "request_changes", feedback: "Please check the revision." })));
    expect(screen.getByRole("button", { name: "Publish changes" })).toBeTruthy();
  });
});
