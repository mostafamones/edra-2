import { ignoreHiddenTransitionError } from "./lib/hidden-transition";

// Install before hydration and before recoverable React errors reach the development overlay.
window.addEventListener("error", ignoreHiddenTransitionError, { capture: true });
