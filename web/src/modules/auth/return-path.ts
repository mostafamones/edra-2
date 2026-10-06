import { returnDestinationHref, validateReturnDestination } from "../../lib/routing";

/** Relative continuations stay on the originating auth host; cross-host targets are allowlisted. */
export function safeNextPath(value: unknown, fallback = "/", platform: "staff" | "student" = "staff") {
  const destination = validateReturnDestination(value, platform);
  if (!destination) return fallback;
  return typeof value === "string" && value.startsWith("/") ? destination.path : returnDestinationHref(destination);
}
