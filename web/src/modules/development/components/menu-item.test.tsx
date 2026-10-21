// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ status: vi.fn(), run: vi.fn() }));
vi.mock("../use-preview", () => ({
  usePreviewStatus: () => ({ data: api.status() }),
  usePreviewAction: () => ({ pending: false, run: api.run }),
}));

import { DropdownMenu, DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { DeveloperModeMenuItem } from "./menu-item";
import type { PreviewStatus } from "../types";

const runId = "12345678-1234-4123-8123-123456789012";
const mount = (status: PreviewStatus) => {
  api.status.mockReturnValue(status);
  return render(<DropdownMenu open><DropdownMenuContent><DeveloperModeMenuItem /></DropdownMenuContent></DropdownMenu>);
};

beforeEach(() => api.run.mockReset());
afterEach(cleanup);

describe("DeveloperModeMenuItem", () => {
  it("is hidden when unavailable, active, or without a run", () => {
    mount({ available: false });
    expect(screen.queryByText("Developer mode")).toBeNull();
    cleanup();
    mount({ available: true, active: false, run: null, students: [] });
    expect(screen.queryByText("Developer mode")).toBeNull();
    cleanup();
    mount({ available: true, active: true, run: { id: runId, academySlug: "edra" }, revision: 1, expiresAt: "", current: { kind: "original", logicalId: null, displayName: "Dev", role: "instructor" }, priorStaff: null, staffTargets: [], students: [] });
    expect(screen.queryByText("Developer mode")).toBeNull();
  });

  it("enters Developer mode from the menu when inactive with a run", () => {
    mount({ available: true, active: false, run: { id: runId, academySlug: "edra" }, students: [] });
    fireEvent.click(screen.getByRole("menuitem", { name: "Developer mode" }));
    expect(api.run).toHaveBeenCalledWith("enter", { runId, studentLogicalId: null, returnTo: expect.any(String) });
  });
});
