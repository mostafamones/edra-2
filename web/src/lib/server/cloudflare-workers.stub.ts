// Vitest stand-in for the workerd-only module; tests spy on it to observe scheduled work.
export const waitUntil = (promise: Promise<unknown>) => { void promise; };
