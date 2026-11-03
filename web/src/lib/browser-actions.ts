import { browserScopeGeneration } from './browser-scope';

/** Preserve Next's per-browser action ordering without sharing a queue across SSR requests. */
export function createBrowserActionQueue(scope: () => number) {
  let current = scope();
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(action: () => Promise<T>): Promise<T> => {
    const captured = scope();
    // A new account must not wait for the previous account's transport.
    if (captured !== current) { current = captured; tail = Promise.resolve(); }
    const result = tail.then(async () => {
      if (captured !== scope()) return { stale: true } as const;
      try {
        const value = await action();
        return captured === scope() ? { value } : { stale: true } as const;
      } catch (error) {
        return captured === scope() ? { error } : { stale: true } as const;
      }
    });
    // Cancellation and rejected calls release the queue, including across identity changes.
    tail = result.then(() => undefined, () => undefined);
    return result.then(outcome => {
      // The old scope is unmounted by AuthProvider. Do not run its success/error
      // callbacks, which can otherwise repopulate caches or toast in the new scope.
      if ('stale' in outcome) return new Promise<never>(() => {});
      if ('error' in outcome) throw outcome.error;
      return outcome.value;
    });
  };
}

const enqueue = createBrowserActionQueue(browserScopeGeneration);
export function runBrowserAction<T>(action: () => Promise<T>): Promise<T> {
  return typeof window === 'undefined' ? action() : enqueue(action);
}
