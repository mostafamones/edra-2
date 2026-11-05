// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { HEADER_ACTIONS_ID } from "@/components/shared/header-actions";
import type { NotificationItem } from "../validation";

const ids = { academy: "11111111-1111-4111-8111-111111111111", other: "99999999-9999-4999-8999-999999999999", concern: "22222222-2222-4222-8222-222222222222", message: "33333333-3333-4333-8333-333333333333", n1: "44444444-4444-4444-8444-444444444444", n2: "55555555-5555-4555-8555-555555555555" };
const state = vi.hoisted(() => ({
  academyId: "", slug: "north", userId: "user-a", rpc: vi.fn(), openConcern: vi.fn(), push: vi.fn(), replace: vi.fn(), search: "", pathname: "/north",
  publicKey: null as string | null,
}));
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: state.userId }, activeAcademy: { id: state.academyId, slug: state.slug } }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc: state.rpc }) }));
vi.mock("@/lib/navigation", () => ({
  useRouter: () => ({ push: state.push, replace: state.replace }), usePathname: () => state.pathname, useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("../actions", () => ({ loadPushPublicKey: vi.fn(async () => state.publicKey) }));
vi.mock("@/modules/concerns", async (original) => ({ ...await original<typeof import("@/modules/concerns")>(), useConcernPanel: () => ({ openConcern: state.openConcern }) }));

const { NotificationCenter } = await import("./center");
const { usePushSubscription } = await import("../push");
const { advanceBrowserScope } = await import("@/lib/browser-scope");

const stamp = "2026-11-05T06:00:00.000Z";
const item = (extra: Partial<NotificationItem> = {}): NotificationItem => ({
  id: ids.n1, kind: "concern_message", academyId: ids.academy, concernId: ids.concern, concernTitle: "Late fees", messageId: ids.message,
  actorName: "Mona", createdAt: stamp, readAt: null, body: "Please check", media: null, deleted: false, ...extra,
});
let items: NotificationItem[];
let unread: number;

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><TooltipProvider><header><div id={HEADER_ACTIONS_ID} /></header><NotificationCenter /></TooltipProvider></QueryClientProvider>);
}
const bell = () => screen.findByRole("button", { name: /^Notifications/ });

beforeEach(() => {
  vi.clearAllMocks();
  state.academyId = ids.academy; state.slug = "north"; state.userId = "user-a"; state.search = ""; state.pathname = "/north"; state.publicKey = null;
  items = [item(), item({ id: ids.n2, kind: "concern_mention", body: null, media: { count: 1, voice: true }, readAt: stamp })];
  unread = 7;
  state.rpc.mockImplementation(async (name: string, input: Record<string, unknown>) => {
    if (name === "notification_unread") return { data: { count: unread }, error: null };
    if (name === "notification_inbox") return { data: { items: input.p_before ? [] : items, hasMore: !input.p_before }, error: null };
    if (name === "mark_notifications_read") { unread = 0; return { data: { marked: 1 }, error: null }; }
    return { data: null, error: null };
  });
  state.openConcern.mockResolvedValue("opened");
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("notification popover", () => {
  it("shows the server unread total, loads the list only when opened, and renders current previews", async () => {
    mount();
    await waitFor(async () => expect((await bell()).getAttribute("aria-label")).toBe("Notifications, 7 unread"));
    expect(state.rpc.mock.calls.map(([name]) => name)).toEqual(["notification_unread"]);
    fireEvent.click(await bell());
    const list = await screen.findByRole("list", { name: "Notifications" });
    expect(within(list).getByText("Mona")).toBeTruthy();
    expect(within(list).getByText("Please check")).toBeTruthy();
    expect(within(list).getByText("Mona mentioned you")).toBeTruthy();
    expect(within(list).getByText("Voice note")).toBeTruthy();
    expect(within(list).getAllByText("Unread")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("notification_inbox", expect.objectContaining({ p_before: stamp, p_before_id: ids.n2 })));
  });

  it("describes deleted messages only as deleted and shows empty/error states", async () => {
    items = [item({ body: null, deleted: true })];
    mount();
    fireEvent.click(await bell());
    expect(await screen.findByText("Message deleted")).toBeTruthy();
    expect(screen.queryByText("Please check")).toBeNull();
    cleanup();
    items = [];
    mount();
    fireEvent.click(await bell());
    expect(await screen.findByText("No notifications")).toBeTruthy();
    cleanup();
    state.rpc.mockImplementation(async (name: string) => name === "notification_inbox" ? { data: null, error: { code: "XX000" } } : { data: { count: 0 }, error: null });
    mount();
    fireEvent.click(await bell());
    // One automatic retry first.
    expect(await screen.findByText("Could not load notifications", {}, { timeout: 4000 })).toBeTruthy();
  });

  it("marks read and opens the concern through the access-rechecking panel API", async () => {
    mount();
    fireEvent.click(await bell());
    fireEvent.click(await screen.findByRole("button", { name: /Please check/ }));
    await waitFor(() => expect(state.openConcern).toHaveBeenCalledWith({ academyId: ids.academy, concernId: ids.concern, messageId: ids.message }));
    expect(state.rpc).toHaveBeenCalledWith("mark_notifications_read", { p_academy_id: ids.academy, p_ids: [ids.n1] });
    await waitFor(async () => expect((await bell()).getAttribute("aria-label")).toBe("Notifications"));
  });

  it("marks all read for the academy and reports a failure", async () => {
    mount();
    fireEvent.click(await bell());
    state.rpc.mockImplementationOnce(async () => ({ data: null, error: { code: "XX000" } }));
    fireEvent.click(await screen.findByRole("button", { name: "Mark all read" }));
    expect(await screen.findByText("Could not mark notifications read")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(state.rpc).toHaveBeenLastCalledWith("mark_notifications_read", { p_academy_id: ids.academy }));
  });

  it("drops the previous academy's list on an academy switch", async () => {
    const view = mount();
    fireEvent.click(await bell());
    await screen.findByText("Please check");
    state.academyId = ids.other; items = [];
    view.rerender(<QueryClientProvider client={new QueryClient()}><TooltipProvider><header><div id={HEADER_ACTIONS_ID} /></header><NotificationCenter /></TooltipProvider></QueryClientProvider>);
    await waitFor(() => expect(screen.queryByText("Please check")).toBeNull());
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("notification_unread", { p_academy_id: ids.other }));
  });
});

describe("notification activation", () => {
  it("opens a same-academy query target once, marks it read and removes the query", async () => {
    state.search = `tab=x&concern=${ids.concern}&message=${ids.message}&notification=${ids.n1}`;
    mount();
    await waitFor(() => expect(state.openConcern).toHaveBeenCalledWith({ academyId: ids.academy, concernId: ids.concern, messageId: ids.message }));
    expect(state.replace).toHaveBeenCalledWith("/north?tab=x");
    expect(state.rpc).toHaveBeenCalledWith("mark_notifications_read", { p_academy_id: ids.academy, p_ids: [ids.n1] });
  });

  it("ignores malformed targets and targets for another academy path", async () => {
    state.search = "concern=not-an-id";
    mount();
    await bell();
    expect(state.openConcern).not.toHaveBeenCalled();
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("routes service worker clicks: same academy opens in place, another academy navigates first, others are refused", async () => {
    const worker = new EventTarget();
    vi.stubGlobal("navigator", { ...navigator, serviceWorker: worker });
    mount();
    await bell();
    const post = (data: unknown) => act(() => { worker.dispatchEvent(new MessageEvent("message", { data })); });
    post({ type: "edra-notification-open", url: `/north?concern=${ids.concern}` });
    await waitFor(() => expect(state.openConcern).toHaveBeenCalledWith({ academyId: ids.academy, concernId: ids.concern }));
    expect(state.push).not.toHaveBeenCalled();
    post({ type: "edra-notification-open", url: `/south?concern=${ids.concern}&message=${ids.message}` });
    expect(state.push).toHaveBeenCalledWith(`/south?concern=${ids.concern}&message=${ids.message}`);
    for (const url of ["https://evil.test/north?concern=" + ids.concern, "//evil.test/x", "/north/students?concern=" + ids.concern, "/north?concern=1"]) post({ type: "edra-notification-open", url });
    post({ type: "other", url: `/north?concern=${ids.concern}` });
    expect(state.openConcern).toHaveBeenCalledTimes(1);
    expect(state.push).toHaveBeenCalledTimes(1);
  });
});

describe("browser push opt-in", () => {
  type Sub = { endpoint: string; options: { applicationServerKey: ArrayBuffer | null }; toJSON: () => unknown; unsubscribe: ReturnType<typeof vi.fn> };
  const p256dh = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
  const auth = "BTBZMqHH6r4Tts7J_aSIgg";
  let permission: NotificationPermission;
  let subscription: Sub | null;
  let shown: { close: ReturnType<typeof vi.fn> }[];
  const requestPermission = vi.fn();
  function browser({ secure = true, keyBytes = new Uint8Array(65).fill(4) } = {}) {
    state.publicKey = btoa(String.fromCharCode(...keyBytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const make = (endpoint = "https://fcm.googleapis.com/fcm/send/synthetic"): Sub => ({ endpoint, options: { applicationServerKey: keyBytes.buffer }, toJSON: () => ({ endpoint, keys: { p256dh, auth } }), unsubscribe: vi.fn(async () => { subscription = null; return true; }) });
    const registration = {
      pushManager: { getSubscription: vi.fn(async () => subscription), subscribe: vi.fn(async () => (subscription = make())) },
      getNotifications: vi.fn(async () => shown),
    };
    vi.stubGlobal("isSecureContext", secure);
    vi.stubGlobal("PushManager", class {});
    // A live getter (Object.assign would copy the value once).
    vi.stubGlobal("Notification", Object.defineProperties(class {}, { permission: { get: () => permission }, requestPermission: { value: requestPermission } }));
    vi.stubGlobal("navigator", { ...navigator, serviceWorker: Object.assign(new EventTarget(), {
      getRegistration: vi.fn(async () => subscription ? registration : undefined), register: vi.fn(async () => registration), ready: Promise.resolve(registration),
    }) });
    return { registration, make };
  }
  beforeEach(() => { permission = "default"; subscription = null; shown = [{ close: vi.fn() }]; requestPermission.mockReset(); });
  const toggle = async () => { fireEvent.click(await bell()); return screen.findByRole("switch", { name: "Browser notifications" }); };

  it("reports unsupported and unconfigured browsers without prompting", async () => {
    mount();
    expect((await toggle()).hasAttribute("disabled")).toBe(true);
    expect(await screen.findByText("Not supported in this browser")).toBeTruthy();
    cleanup();
    browser(); state.publicKey = null;
    mount();
    expect((await toggle()).hasAttribute("disabled")).toBe(true);
    expect(await screen.findByText("Unavailable")).toBeTruthy();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("asks permission only from the switch, subscribes and registers this browser", async () => {
    const { registration } = browser();
    requestPermission.mockImplementation(async () => (permission = "granted"));
    mount();
    const control = await toggle();
    await waitFor(() => expect(control.hasAttribute("disabled")).toBe(false));
    expect(requestPermission).not.toHaveBeenCalled();
    fireEvent.click(control);
    await waitFor(() => expect(control.getAttribute("aria-checked")).toBe("true"));
    expect(registration.pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(state.rpc).toHaveBeenCalledWith("register_push_subscription", { p_endpoint: "https://fcm.googleapis.com/fcm/send/synthetic", p_p256dh: p256dh, p_auth: auth });
    fireEvent.click(control);
    await waitFor(() => expect(control.getAttribute("aria-checked")).toBe("false"));
    expect(state.rpc).toHaveBeenCalledWith("release_push_subscription", { p_endpoint: "https://fcm.googleapis.com/fcm/send/synthetic", p_auth: auth });
  });

  it("shows a denied permission with a recheck, and recovers a failed registration", async () => {
    browser();
    requestPermission.mockImplementation(async () => (permission = "denied"));
    mount();
    const control = await toggle();
    await waitFor(() => expect(control.hasAttribute("disabled")).toBe(false));
    fireEvent.click(control);
    expect(await screen.findByText("Blocked in browser settings")).toBeTruthy();
    permission = "default";
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(screen.queryByText("Blocked in browser settings")).toBeNull());
    requestPermission.mockImplementation(async () => (permission = "granted"));
    state.rpc.mockImplementationOnce(async () => ({ data: null, error: { code: "P0001", message: "conflict" } }));
    fireEvent.click(control);
    expect(await screen.findByText("Could not update browser notifications")).toBeTruthy();
  });

  it("releases a subscription this browser holds for another account and closes its previews", async () => {
    const { make } = browser();
    permission = "granted"; subscription = make();
    state.rpc.mockImplementation(async (name: string) => name === "push_subscription_state" ? { data: { state: "other" }, error: null }
      : name === "notification_unread" ? { data: { count: 0 }, error: null } : { data: null, error: null });
    mount();
    // On load, without opening the popover.
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("release_push_subscription", expect.objectContaining({ p_auth: auth })));
    await waitFor(() => expect(shown[0].close).toHaveBeenCalled());
    const control = await toggle();
    expect(control.getAttribute("aria-checked")).toBe("false");
    expect(subscription).toBeNull();
  });

  it.each(["worker readiness", "subscription creation"])("does not register an old opt-in after scope changes during %s", async (stage) => {
    const { registration, make } = browser();
    requestPermission.mockResolvedValue("granted");
    let resume!: (value: never) => void;
    const pending = new Promise<never>((resolve) => { resume = resolve; });
    if (stage === "worker readiness") {
      Object.assign(navigator.serviceWorker, { ready: pending });
    } else {
      registration.pushManager.subscribe.mockImplementationOnce(() => pending);
    }
    const hook = renderHook(() => usePushSubscription("user-a"));
    await waitFor(() => expect(hook.result.current.status).toBe("off"));
    let operation!: Promise<void>;
    act(() => { operation = hook.result.current.enable(); });
    await waitFor(() => expect(stage === "worker readiness" ? navigator.serviceWorker.register : registration.pushManager.subscribe).toHaveBeenCalled());
    advanceBrowserScope();
    hook.unmount();
    await act(async () => { resume((stage === "worker readiness" ? registration : make()) as never); await operation; });
    expect(state.rpc.mock.calls.some(([name]) => name === "register_push_subscription")).toBe(false);
  });

  it("does not release another account's subscription after an old detection finishes", async () => {
    const { make } = browser();
    permission = "granted"; subscription = make();
    const original = subscription;
    let resume!: (value: unknown) => void;
    state.rpc.mockImplementation(() => new Promise((resolve) => { resume = resolve; }));
    const hook = renderHook(() => usePushSubscription("user-a"));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("push_subscription_state", expect.anything()));
    advanceBrowserScope();
    hook.unmount();
    await act(async () => { resume({ data: { state: "other" }, error: null }); });
    expect(state.rpc.mock.calls.some(([name]) => name === "release_push_subscription")).toBe(false);
    expect(original.unsubscribe).not.toHaveBeenCalled();
  });

  it("shows this account's existing subscription as on", async () => {
    const { make } = browser();
    permission = "granted"; subscription = make();
    state.rpc.mockImplementation(async (name: string) => name === "push_subscription_state" ? { data: { state: "mine" }, error: null } : { data: { count: 0 }, error: null });
    mount();
    const control = await toggle();
    await waitFor(() => expect(control.getAttribute("aria-checked")).toBe("true"));
    expect(state.rpc).not.toHaveBeenCalledWith("release_push_subscription", expect.anything());
  });
});
