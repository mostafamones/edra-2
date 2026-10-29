// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAssessmentView, viewKey } from "./view";

let narrow = false;
const listeners = new Set<() => void>();
function setWidth(mobile: boolean) {
  narrow = mobile;
  for (const listener of listeners) listener();
}

beforeEach(() => {
  narrow = false;
  window.matchMedia = vi.fn().mockImplementation(() => ({
    get matches() { return narrow; },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
});
afterEach(() => { cleanup(); localStorage.clear(); listeners.clear(); vi.restoreAllMocks(); });

describe("Assessments view preference", () => {
  it("defaults to Table on desktop and Cards on mobile, following resizes without a saved choice", () => {
    const { result } = renderHook(() => useAssessmentView("user-1"));
    expect(result.current[0]).toBe("table");
    act(() => setWidth(true));
    expect(result.current[0]).toBe("cards");
  });

  it("keeps an explicit choice per user over the responsive default, including after resizing", () => {
    const { result } = renderHook(() => useAssessmentView("user-1"));
    act(() => result.current[1]("cards"));
    expect(localStorage.getItem(viewKey("user-1"))).toBe("cards");
    act(() => setWidth(true));
    act(() => setWidth(false));
    expect(result.current[0]).toBe("cards");
    expect(localStorage.getItem(viewKey("user-1"))).toBe("cards");
    // Another account on this browser keeps its own default.
    expect(renderHook(() => useAssessmentView("user-2")).result.current[0]).toBe("table");
    // A remount restores the saved choice.
    expect(renderHook(() => useAssessmentView("user-1")).result.current[0]).toBe("cards");
  });

  it("ignores unreadable values and keeps working when storage is unavailable", () => {
    localStorage.setItem(viewKey("user-3"), "grid");
    expect(renderHook(() => useAssessmentView("user-3")).result.current[0]).toBe("table");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const { result } = renderHook(() => useAssessmentView("user-4"));
    expect(result.current[0]).toBe("table");
    act(() => result.current[1]("cards"));
    expect(result.current[0]).toBe("cards");
  });

  it("does not save anything without a signed-in user", () => {
    const { result } = renderHook(() => useAssessmentView(undefined));
    act(() => result.current[1]("cards"));
    expect(result.current[0]).toBe("table");
    expect(localStorage.length).toBe(0);
  });
});
