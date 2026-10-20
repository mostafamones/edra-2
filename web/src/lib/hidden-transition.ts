/**
 * React bundled with Next 16.3.5 recognizes older hidden-document skip messages only.
 * https://github.com/react/react/issues/37669
 * Remove this compatibility filter once the bundled React handles these messages.
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
