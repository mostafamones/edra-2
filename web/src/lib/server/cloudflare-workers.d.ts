// The subset of the Worker runtime module this app uses (provided by workerd, not an npm package).
declare module "cloudflare:workers" {
  /** Extends the current invocation for background work (up to 30 s after the response). */
  export function waitUntil(promise: Promise<unknown>): void;
}
