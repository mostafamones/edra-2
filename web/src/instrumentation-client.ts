import { ignoreHiddenTransitionError } from "./lib/hidden-transition";

// Imported by client.tsx before hydration and recoverable React error reporting.
window.addEventListener("error", ignoreHiddenTransitionError, { capture: true });
