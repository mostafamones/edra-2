// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ status: vi.fn(), refetch: vi.fn(), run: vi.fn(), expired: vi.fn(), pending: false }));
vi.mock("@/modules/auth", () => ({ requestSessionRecovery: api.expired }));
vi.mock("../use-preview", () => ({
  usePreviewStatus: () => ({ data: api.status(), refetch: api.refetch }),
  usePreviewAction: () => ({ pending: api.pending, run: api.run }),
}));

import { DeveloperPreviewFrame } from "./frame";

const runId = "12345678-1234-4123-8123-123456789012";
const base = { available: true as const, active: true as const, run: { id: runId, academySlug: "edra" }, revision: 7, expiresAt: new Date(Date.now() + 3_600_000).toISOString(), priorStaff: null, students: [], staffTargets: [] };
const original = { kind: "original" as const, logicalId: null, displayName: "Dev Owner", role: "instructor" as const };
const studentIdentity = { kind: "student" as const, logicalId: "account:student:ana", displayName: "Ana Student", role: "student" as const };

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  HTMLElement.prototype.scrollIntoView ??= vi.fn();
});
beforeEach(() => { api.pending = false; api.run.mockReset(); api.refetch.mockReset(); api.expired.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const mount = (status: unknown) => { api.status.mockReturnValue(status); return render(<DeveloperPreviewFrame><p>App content</p></DeveloperPreviewFrame>); };

describe("DeveloperPreviewFrame", () => {
  it("recovers when a generated identity reaches its trusted preview expiry", async () => {
    vi.useFakeTimers();
    mount({ ...base, current: studentIdentity, expiresAt: new Date(Date.now() + 1000).toISOString() });
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.expired).toHaveBeenCalledWith("preview");
  });
  it("renders children without the bar when Developer mode is unavailable", () => {
    mount({ available: false });
    expect(screen.getByText("App content")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Developer preview" })).toBeNull();
  });

  it("shows the student state with return and exit actions", () => {
    mount({ ...base, current: studentIdentity, priorStaff: original, staffTargets: [], students: [{ logicalId: studentIdentity.logicalId, displayName: studentIdentity.displayName, annualStudentRecordId: "record", participationType: "online_only" }] });
    expect(screen.getByRole("combobox", { name: "Preview identity" })).toBeTruthy();
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
    expect(screen.queryByText("App content")).toBeNull();
  });

  it("shows the identity selector for staff and no return action", () => {
    mount({ ...base, current: original, staffTargets: [{ logicalId: "account:staff:owner", displayName: "Dev Owner", role: "owner" }] });
    expect(screen.getByRole("combobox", { name: "Preview identity" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Return to staff" })).toBeNull();
  });

  it("updates the selected label when refreshed profile names arrive", async () => {
    const owner = { logicalId: "account:staff:owner", displayName: "Generated name", role: "owner" as const };
    const status = { ...base, current: { kind: "staff" as const, ...owner }, staffTargets: [owner] };
    const view = mount(status);
    expect(screen.getByRole("combobox", { name: "Preview identity" }).textContent).toContain("Generated name");
    api.status.mockReturnValue({ ...status, current: { ...status.current, displayName: "Current profile" }, staffTargets: [{ ...owner, displayName: "Current profile" }] });
    view.rerender(<DeveloperPreviewFrame><p>App content</p></DeveloperPreviewFrame>);
    expect(await screen.findByText("Current profile · Owner")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Preview identity" }).textContent).toContain("Current profile");
  });

  it("sends the current account page when selecting another staff identity", async () => {
    window.history.replaceState(null, "", "/account?tab=profile");
    mount({ ...base, current: original, staffTargets: [{ logicalId: "account:staff:owner", displayName: "Dev Owner", role: "owner" }] });
    fireEvent.click(screen.getByRole("combobox", { name: "Preview identity" }));
    expect(api.refetch).toHaveBeenCalledOnce();
    fireEvent.click(await screen.findByRole("option", { name: "Dev Owner · Owner" }));
    expect(api.run).toHaveBeenCalledWith("switch", {
      runId, logicalId: "account:staff:owner", expectedRevision: 7, returnTo: window.location.href,
    });
    window.history.replaceState(null, "", "/");
  });
});
