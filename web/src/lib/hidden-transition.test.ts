import { describe, expect, it, vi } from "vitest";

import { ignoreHiddenTransitionError } from "./hidden-transition";

function reported(error: unknown) {
  return { error, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
}

describe("hidden document view-transition compatibility", () => {
  it.each([
    "Transition was aborted because of invalid state. Document hidden",
    "Skipped ViewTransition due to document being hidden",
  ])("ignores the known skipped animation: %s", (message) => {
    const event = reported({ name: "InvalidStateError", message });
    ignoreHiddenTransitionError(event as unknown as ErrorEvent);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
  });

  it.each([
    { name: "InvalidStateError", message: "Transition was aborted because of invalid state. Viewport size changed" },
    { name: "Error", message: "Transition was aborted because of invalid state. Document hidden" },
    { name: "Error", message: "Hydration failed" },
    { name: "InvalidStateError", message: "A different invalid state" },
    null,
    "Transition was aborted because of invalid state. Document hidden",
  ])("preserves unrelated errors: %j", (error) => {
    const event = reported(error);
    ignoreHiddenTransitionError(event as unknown as ErrorEvent);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
  });
});
