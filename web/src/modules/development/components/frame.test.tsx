// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ status: vi.fn(), run: vi.fn(), pending: false }));
vi.mock("../use-preview", () => ({
  usePreviewStatus: () => ({ data: api.status() }),
  usePreviewAction: () => ({ pending: api.pending, run: api.run }),
}));

import { DeveloperPreviewFrame } from "./frame";

const runId = "12345678-1234-4123-8123-123456789012";
const base = { available: true as const, active: true as const, run: { id: runId, academySlug: "edra" }, revision: 7, expiresAt: "2026-10-21T10:00:00Z", priorStaff: null, students: [], staffTargets: [] };
const original = { kind: "original" as const, logicalId: null, displayName: "Dev Owner", role: "instructor" as const };
const studentIdentity = { kind: "student" as const, logicalId: "account:student:ana", displayName: "Ana Student", role: "student" as const };

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
beforeEach(() => { api.pending = false; api.run.mockReset(); });
afterEach(cleanup);

const mount = (status: unknown) => { api.status.mockReturnValue(status); return render(<DeveloperPreviewFrame><p>App content</p></DeveloperPreviewFrame>); };

describe("DeveloperPreviewFrame", () => {
  it("renders children without the bar when Developer mode is unavailable", () => {
    mount({ available: false });
    expect(screen.getByText("App content")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Developer preview" })).toBeNull();
  });

  it("shows the student state with return and exit actions", () => {
    mount({ ...base, current: studentIdentity, priorStaff: original, staffTargets: [] });
    expect(screen.getByText("Ana Student")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Return to staff" }));
    expect(api.run).toHaveBeenCalledWith("return", { runId, expectedRevision: 7 });
    fireEvent.click(screen.getByRole("button", { name: "Exit preview" }));
    expect(api.run).toHaveBeenCalledWith("exit", { runId });
  });

  it("disables actions and shows the switching label while pending", () => {
    api.pending = true;
    mount({ ...base, current: studentIdentity, staffTargets: [] });
    expect((screen.getByRole("button", { name: "Return to staff" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Exit preview" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText("Switching")).toBeTruthy();
  });

  it("shows the identity selector for staff and no return action", () => {
    mount({ ...base, current: original, staffTargets: [{ logicalId: "account:staff:owner", displayName: "Dev Owner", role: "owner" }] });
    expect(screen.getByRole("combobox", { name: "Preview identity" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Return to staff" })).toBeNull();
  });
});
