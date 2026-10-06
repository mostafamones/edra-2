import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";

const harness = vi.hoisted(() => ({
  effects: [] as Array<{ run: () => void | (() => void); dependencies: unknown }>,
  state: [] as unknown[],
  authEvent: undefined as undefined | ((event: string, session: Session | null) => void),
  refresh: vi.fn(),
  clearCache: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useEffect: (run: () => void | (() => void), dependencies: unknown) => harness.effects.push({ run, dependencies }),
  useEffectEvent: (callback: unknown) => callback,
  useState: (initial: unknown) => {
    const index = harness.state.length;
    const value = typeof initial === "function" ? initial() : initial;
    harness.state.push(value);
    return [value, (next: unknown) => { harness.state[index] = next; }];
  },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/magd", useRouter: () => ({ refresh: harness.refresh }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [], error: null, isPending: false, refetch: vi.fn() }) }));
vi.mock("@/modules/academies", () => ({ academyQueryKeys: { forUser: (id: string) => [id] }, listUserAcademies: vi.fn() }));
vi.mock("@/lib/query-client", () => ({ clearBrowserQueryCache: harness.clearCache }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: {
  getSession: harness.getSession, getUser: harness.getUser,
  onAuthStateChange: (callback: typeof harness.authEvent) => {
    harness.authEvent = callback;
    return { data: { subscription: { unsubscribe: harness.unsubscribe } } };
  },
} }) }));
vi.mock("./loading-overlay", () => ({ AuthLoadingOverlay: () => null }));
vi.mock("./load-error", () => ({ AuthLoadError: () => null }));
import { AuthProvider } from "./provider";

const session = (id: string) => ({ user: { id }, access_token: `token-${id}` }) as Session;
let cleanup: (() => void) | undefined;
let browser: EventTarget;
const flush = async () => { await vi.advanceTimersByTimeAsync(0); };
function mount() {
  AuthProvider({ children: null, initialPlatform: "staff" });
  cleanup = harness.effects[0].run() as (() => void);
}

describe("auth provider lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    harness.effects = [];
    harness.state = [];
    harness.authEvent = undefined;
    harness.getSession.mockResolvedValue({ data: { session: null }, error: null });
    harness.getUser.mockResolvedValue({ data: { user: null }, error: null });
    browser = new EventTarget();
    Object.assign(browser, { localStorage: { getItem: () => null, removeItem: vi.fn() } });
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
  });
  afterEach(() => { cleanup?.(); cleanup = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("does not refresh on initial or repeated signed-out notifications", async () => {
    mount();
    harness.authEvent?.("SIGNED_OUT", null);
    harness.authEvent?.("INITIAL_SESSION", null);
    harness.authEvent?.("SIGNED_OUT", null);
    await flush();
    expect(harness.refresh).not.toHaveBeenCalled();
    expect(harness.clearCache).not.toHaveBeenCalled();
    expect(harness.state[1]).toBe(false);
    // Re-rendering server payloads must not recreate the subscription.
    expect(harness.effects[0].dependencies).toEqual([]);
  });

  it("discovers an existing session without refreshing the server-rendered route", async () => {
    harness.getSession.mockResolvedValue({ data: { session: session("a") }, error: null });
    mount();
    await flush();
    harness.authEvent?.("INITIAL_SESSION", session("a"));
    harness.authEvent?.("SIGNED_IN", session("a"));
    await flush();
    expect(harness.refresh).not.toHaveBeenCalled();
    expect(harness.state[0]).toEqual(session("a"));
  });

  it("refreshes once after a real sign-out and clears account-owned data", async () => {
    mount();
    harness.authEvent?.("INITIAL_SESSION", session("a"));
    harness.authEvent?.("SIGNED_OUT", null);
    harness.authEvent?.("SIGNED_OUT", null);
    expect(harness.refresh).not.toHaveBeenCalled();
    await flush();
    expect(harness.refresh).toHaveBeenCalledTimes(1);
    expect(harness.clearCache).toHaveBeenCalledTimes(1);
    expect(harness.state[0]).toBeNull();
  });

  it("cancels refreshes and subscriptions when the provider unmounts", async () => {
    mount();
    harness.authEvent?.("INITIAL_SESSION", session("a"));
    harness.authEvent?.("SIGNED_OUT", null);
    cleanup?.();
    cleanup = undefined;
    harness.authEvent?.("SIGNED_IN", session("b"));
    await flush();
    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
    expect(harness.refresh).not.toHaveBeenCalled();
    expect(harness.state[0]).toBeNull();
  });

  it("detects a cross-platform account change on focus without repeated refreshes", async () => {
    mount();
    harness.authEvent?.("INITIAL_SESSION", session("a"));
    harness.getSession.mockResolvedValue({ data: { session: session("b") }, error: null });
    harness.getUser.mockResolvedValue({ data: { user: { id: "b" } }, error: null });
    browser.dispatchEvent(new Event("focus"));
    await flush();
    expect(harness.refresh).toHaveBeenCalledTimes(1);
    expect(harness.state[0]).toEqual(session("b"));
    await vi.advanceTimersByTimeAsync(1500);
    browser.dispatchEvent(new Event("focus"));
    await flush();
    expect(harness.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not sign out or refresh for a temporary verification error", async () => {
    mount();
    harness.authEvent?.("INITIAL_SESSION", session("a"));
    harness.getSession.mockResolvedValue({ data: { session: session("a") }, error: null });
    harness.getUser.mockResolvedValue({ data: { user: null }, error: new Error("Network unavailable") });
    browser.dispatchEvent(new Event("focus"));
    await flush();
    expect(harness.state[0]).toEqual(session("a"));
    expect(harness.refresh).not.toHaveBeenCalled();
  });

  it("ignores an older focus check after a newer auth event", async () => {
    let resolveUser!: (value: unknown) => void;
    mount();
    harness.authEvent?.("INITIAL_SESSION", session("a"));
    harness.getSession.mockResolvedValue({ data: { session: session("a") }, error: null });
    harness.getUser.mockImplementation(() => new Promise((resolve) => { resolveUser = resolve; }));
    browser.dispatchEvent(new Event("focus"));
    await flush();
    harness.authEvent?.("SIGNED_IN", session("b"));
    resolveUser({ data: { user: { id: "a" } }, error: null });
    await flush();
    expect(harness.state[0]).toEqual(session("b"));
    expect(harness.refresh).toHaveBeenCalledTimes(1);
  });
});
