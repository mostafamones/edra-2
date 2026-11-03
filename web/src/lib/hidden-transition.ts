/**
 * Browsers can abort view transitions when the document becomes hidden.
 * https://github.com/react/react/issues/37669
 * Ignore only these expected skips; unrelated hydration and runtime errors remain visible.
 */
export function ignoreHiddenTransitionError(event: ErrorEvent) {
  const error: unknown = event.error;
  if (typeof error !== "object" || error === null || !("name" in error) || !("message" in error)) return;
  if (error.name !== "InvalidStateError") return;
  if (error.message !== "Transition was aborted because of invalid state. Document hidden"
    && error.message !== "Skipped ViewTransition due to document being hidden") return;

  // The DOM update still completes; only the background-tab animation was skipped.
  event.preventDefault();
  event.stopImmediatePropagation();
}
