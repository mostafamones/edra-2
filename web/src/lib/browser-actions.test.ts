import { expect, it, vi } from 'vitest';
import { createBrowserActionQueue, runBrowserAction } from './browser-actions';

function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }

it('orders browser actions through completion, including after a failed call', async () => {
  const queue = createBrowserActionQueue(() => 0);
  const blocked = deferred();
  const events: string[] = [];
  const first = queue(async () => { events.push('first'); await blocked.promise; events.push('finished'); throw new Error('rejected'); });
  const rejection = expect(first).rejects.toThrow('rejected');
  const second = queue(async () => { events.push('second'); return 2; });
  await Promise.resolve();
  expect(events).toEqual(['first']);
  blocked.resolve();
  await rejection;
  await expect(second).resolves.toBe(2);
  expect(events).toEqual(['first', 'finished', 'second']);
});

it('does not dispatch old queued work or deliver old callbacks into a new account', async () => {
  let generation = 0;
  const queue = createBrowserActionQueue(() => generation);
  const blocked = deferred();
  const oldCallback = vi.fn();
  const queued = vi.fn(async () => 'must not run');
  void queue(async () => { await blocked.promise; return 'old private result'; }).then(oldCallback, oldCallback);
  void queue(queued).then(oldCallback, oldCallback);
  await Promise.resolve();
  generation += 1;
  await expect(queue(async () => 'new account')).resolves.toBe('new account');
  blocked.resolve();
  // Flush the already queued completions, without timers or an unbounded wait.
  for (let n = 0; n < 12; n += 1) await Promise.resolve();
  expect(queued).not.toHaveBeenCalled();
  expect(oldCallback).not.toHaveBeenCalled();
});

it('never shares a browser action queue across server requests', async () => {
  const blocked = deferred();
  const first = runBrowserAction(async () => { await blocked.promise; return 'first'; });
  await expect(runBrowserAction(async () => 'independent request')).resolves.toBe('independent request');
  blocked.resolve();
  await expect(first).resolves.toBe('first');
});
