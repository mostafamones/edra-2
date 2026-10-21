import assert from "node:assert/strict";

type Handler = (request: Request) => Response | Promise<Response>;
type FetchExpectation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Response;

// One entrypoint import per process. Nothing returned by the serve stub is used by these
// entrypoints; no server, timer, or socket is created.
export async function withEntrypoint(
  load: () => Promise<unknown>,
  environmentNames: readonly string[],
  run: (harness: {
    handle: Handler;
    setEnv: (values: Record<string, string>) => void;
    expectFetch: (expectation: FetchExpectation) => void;
    logs: unknown[][];
    errors: unknown[][];
  }) => Promise<void>,
) {
  const serve = Deno.serve;
  const fetch = globalThis.fetch;
  const log = console.log;
  const error = console.error;
  const environment = environmentNames.map((name) =>
    [name, Deno.env.get(name)] as const
  );
  const pending: FetchExpectation[] = [];
  const fetchFailures: unknown[] = [];
  const logs: unknown[][] = [];
  const errors: unknown[][] = [];
  let handler: Handler | undefined;
  let registrations = 0;
  const setEnv = (values: Record<string, string>) => {
    for (const name of environmentNames) Deno.env.delete(name);
    for (const [name, value] of Object.entries(values)) {
      assert.ok(
        environmentNames.includes(name),
        "Only declared config names may be set",
      );
      Deno.env.set(name, value);
    }
  };
  try {
    setEnv({});
    Deno.serve = ((registered: Handler) => {
      registrations += 1;
      handler = registered;
    }) as unknown as typeof Deno.serve;
    globalThis.fetch = (input, init) => {
      try {
        const expectation = pending.shift();
        assert.ok(expectation, "Unexpected fetch: no canned response queued");
        return Promise.resolve(expectation(input, init));
      } catch (failure) {
        // Production may catch delivery errors, so also fail outside the handler.
        fetchFailures.push(failure);
        return Promise.reject(failure);
      }
    };
    console.log = (...values: unknown[]) => {
      logs.push(values);
    };
    console.error = (...values: unknown[]) => {
      errors.push(values);
    };
    await load();
    assert.equal(
      registrations,
      1,
      "Entrypoint must register exactly one HTTP handler",
    );
    assert.ok(handler, "Entrypoint did not register an HTTP handler");
    await run({
      handle: handler,
      setEnv,
      expectFetch: (expectation) => {
        pending.push(expectation);
      },
      logs,
      errors,
    });
  } finally {
    Deno.serve = serve;
    globalThis.fetch = fetch;
    console.log = log;
    console.error = error;
    for (const [name, value] of environment) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
  assert.deepEqual(
    fetchFailures,
    [],
    "All fetch calls must match their canned expectations",
  );
  assert.equal(pending.length, 0, "Expected fetch was never called");
}
