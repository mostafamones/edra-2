// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
const api = vi.hoisted(() => ({ supported: vi.fn(), fullscreen: vi.fn(), exit: vi.fn(), enter: vi.fn(), lock: vi.fn(), release: vi.fn(), refresh: vi.fn(), recovery: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: api.refresh }) }));
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "12345678-1234-4123-8123-123456789012" }, loading: false }) }));
vi.mock("../actions", () => ({ enterStudentExam: api.enter }));
vi.mock("../answering/recovery", () => ({ recoverDeparture: api.recovery }));
vi.mock("../answering/ownership", () => ({ acquireEditorLock: api.lock, readRecoveryToken: () => null, storeRecoveryToken: vi.fn(), clearRecoveryToken: vi.fn() }));
vi.mock("../integration", () => ({ examEntryIntegration: { fullscreenSupported: api.supported, enterFullscreen: api.fullscreen, exitFullscreen: api.exit,
  Answering: () => <p>Answering mounted</p> } }));
import { StudentExamEntry } from "./entry";
const id = "12345678-1234-4123-8123-123456789012";
const entry = () => ({ ok: true, active: true, attempt: { id }, editor: { status: "claimed", token: "a".repeat(64), generation: 1 } });
beforeEach(() => {
  vi.clearAllMocks(); api.supported.mockReturnValue(true);
  api.fullscreen.mockImplementation(async () => { Object.defineProperty(document, "fullscreenElement", { configurable: true, value: document.documentElement }); return true; });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  api.exit.mockResolvedValue(undefined); api.lock.mockResolvedValue({ status: "held", release: api.release });
  api.enter.mockResolvedValue(entry()); api.recovery.mockResolvedValue({ ok: true });
});
afterEach(() => { cleanup(); localStorage.clear(); });
const mount = () => render(<StrictMode><StudentExamEntry academyId={id} examId={id} resume={false} /></StrictMode>);
describe("fullscreen-first entry boundary", () => {
  it("requests fullscreen synchronously from the click before lock, recovery or network", async () => {
    let accept!: (value: boolean) => void;
    api.fullscreen.mockReturnValue(new Promise<boolean>((done) => { accept = done; }));
    mount(); fireEvent.click(screen.getByRole("button", { name: "Start exam" }));
    expect(api.fullscreen).toHaveBeenCalledOnce(); expect(api.lock).not.toHaveBeenCalled(); expect(api.enter).not.toHaveBeenCalled();
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: document.documentElement });
    accept(true); await screen.findByText("Answering mounted"); expect(api.enter).toHaveBeenCalledOnce();
  });
  it.each(["unsupported", "refused"])("starts nothing when fullscreen is %s", async (reason) => {
    if (reason === "unsupported") api.supported.mockReturnValue(false); else api.fullscreen.mockResolvedValue(false);
    mount(); fireEvent.click(screen.getByRole("button", { name: "Start exam" }));
    await screen.findByRole("alert"); expect(api.enter).not.toHaveBeenCalled(); expect(api.lock).not.toHaveBeenCalled();
  });
  it("cleans up fullscreen and the lock on a busy trusted entry without mounting detection", async () => {
    api.enter.mockResolvedValue({ ok: true, active: true, editor: { status: "busy", retryAfter: 30 } });
    mount(); fireEvent.click(screen.getByRole("button", { name: "Start exam" }));
    await screen.findByRole("alert"); expect(api.release).toHaveBeenCalled(); expect(api.exit).toHaveBeenCalled();
    expect(screen.queryByText("Answering mounted")).toBeNull(); expect(localStorage.length).toBe(0);
  });
  it("discards a late acknowledgment after navigation and releases ownership", async () => {
    let accept!: (value: unknown) => void; api.enter.mockReturnValue(new Promise((done) => { accept = done; }));
    const view = mount(); fireEvent.click(screen.getByRole("button", { name: "Start exam" }));
    await waitFor(() => expect(api.enter).toHaveBeenCalledOnce()); view.unmount(); accept(entry());
    await waitFor(() => expect(api.exit).toHaveBeenCalled()); expect(api.release).toHaveBeenCalled(); expect(localStorage.length).toBe(0);
  });
});
