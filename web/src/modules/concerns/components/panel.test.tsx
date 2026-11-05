// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { advanceBrowserScope } from "@/lib/browser-scope";
import type { ConcernDetail, ConcernMessage, ConcernThread } from "../validation";
import { concernKeys } from "../queries";
import { ConcernPanelProvider, useConcernPanel } from "./panel";

const state = vi.hoisted(() => ({
  academyId: "academy-a", userId: "user-a", role: "admin", mobile: false,
  rpc: vi.fn(), members: vi.fn(), avatars: vi.fn(), live: vi.fn(), inboxLive: vi.fn(),
  createConcern: vi.fn(), sendConcernMessage: vi.fn(), editConcernMessage: vi.fn(), deleteConcernMessage: vi.fn(), setConcernReaction: vi.fn(), markConcernRead: vi.fn(),
}));
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: state.userId }, activeAcademy: { id: state.academyId, role: state.role } }) }));
vi.mock("@/modules/account/browser", () => ({ accountName: (profile: { full_name: string }) => profile.full_name, resolveProfileAvatars: state.avatars }));
vi.mock("@/modules/staff", () => ({ fetchTeamMembers: state.members, staffQueryKeys: { members: (user: string, academy: string) => ["staff", user, academy, "members"] } }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc: state.rpc }) }));
vi.mock("../actions", () => ({ createConcern: state.createConcern, sendConcernMessage: state.sendConcernMessage, editConcernMessage: state.editConcernMessage, deleteConcernMessage: state.deleteConcernMessage, setConcernReaction: state.setConcernReaction, markConcernRead: state.markConcernRead }));
vi.mock("../live", () => ({ useConcernLive: (args: unknown) => { state.live(args); return { status: "live", typers: ["untrusted"], reconnect: vi.fn() }; }, useConcernInboxLive: (scope: unknown) => { state.inboxLive(scope); return { status: "live" }; } }));

const stamp = new Date().toISOString();
function message(seq: number, extra: Partial<ConcernMessage> = {}): ConcernMessage {
  return { id: `message-${seq}`, concernId: "concern-1", seq, revision: seq, body: `Message ${seq}`, authorId: "user-a", authorName: "Mona", mentions: [], createdAt: stamp, editedAt: null, deletedAt: null, replyTo: null, reactions: [], attachments: [], ...extra };
}
function detail(extra: Partial<ConcernDetail> = {}): ConcernDetail {
  return { id: "concern-1", title: "Attendance follow-up", status: "ongoing", createdAt: stamp, createdBy: "user-a", settledAt: null, outcome: null, lastSeq: 2, muted: false,
    participants: [{ userId: "user-a", name: "Mona", avatarPath: null, lastReadSeq: 0, readAt: null }, { userId: "user-b", name: "Omar", avatarPath: "omar.webp", lastReadSeq: 1, readAt: stamp }], ...extra };
}
let currentDetail: ConcernDetail;
let currentMessages: ConcernMessage[];
const observers: { callback: IntersectionObserverCallback; root: Element | Document | null; nodes: Set<Element>; active: boolean }[] = [];
const clients: QueryClient[] = [];
function emit(seq: number, visible = true) {
  for (const observer of observers.filter((item) => item.active)) {
    const nodes = [...observer.nodes].filter((node) => (node as HTMLElement).dataset.concernSeq === String(seq));
    if (nodes.length) observer.callback(nodes.map((node) => ({ target: node, isIntersecting: visible, intersectionRect: { height: visible ? 40 : 0 } }) as IntersectionObserverEntry), {} as IntersectionObserver);
  }
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { resolve, promise }; }

beforeEach(() => {
  vi.clearAllMocks();
  state.academyId = "academy-a"; state.userId = "user-a"; state.role = "admin"; state.mobile = false;
  currentDetail = detail(); currentMessages = [message(1), message(2)]; observers.length = 0;
  state.members.mockResolvedValue([
    { user_id: "user-a", suspended_at: null, profiles: { full_name: "Mona" } },
    { user_id: "user-b", suspended_at: null, profiles: { full_name: "Omar" } },
    { user_id: "suspended", suspended_at: stamp, profiles: { full_name: "Suspended" } },
  ]);
  state.avatars.mockResolvedValue({ "omar.webp": "https://avatar.example/temporary" });
  state.markConcernRead.mockImplementation(async ({ seq }) => ({ ok: true, lastReadSeq: seq, readAt: stamp }));
  state.sendConcernMessage.mockImplementation(async (input) => ({ ok: true, message: message(3, { id: input.messageId, body: input.body, mentions: input.mentions }) }));
  state.editConcernMessage.mockImplementation(async (input) => ({ ok: true, message: message(1, { body: input.body, revision: 10, editedAt: stamp, mentions: input.mentions }) }));
  state.deleteConcernMessage.mockResolvedValue({ ok: true, message: message(1, { revision: 11, body: null, deletedAt: stamp }) });
  state.setConcernReaction.mockImplementation(async ({ emoji, on }) => ({ ok: true, message: message(1, { revision: 12 + state.setConcernReaction.mock.calls.length, reactions: on ? [{ emoji, userIds: ["user-a"] }] : [] }) }));
  state.createConcern.mockImplementation(async (input) => ({ ok: true, concernId: input.concernId, message: message(1) }));
  state.rpc.mockImplementation(async (name: string, input: Record<string, unknown>) => {
    if (name === "concern_unread") return { data: { concerns: 3, messages: 91, mentions: 1 }, error: null };
    if (name === "concern_detail") return { data: currentDetail, error: null };
    if (name === "concern_messages_page") return { data: { messages: currentMessages, hasMore: false, cursor: 2 }, error: null };
    if (name === "concern_inbox") return { data: { concerns: input.p_status === "settled" ? [] : [{ id: "concern-1", title: "Attendance follow-up", status: "ongoing", updatedAt: stamp, muted: false, lastReadSeq: 0, unread: 2, unreadMentions: 0, last: { seq: 2, authorId: "user-a", authorName: "Mona", body: "Message 2", deleted: false, createdAt: stamp } }], hasMore: false }, error: null };
    if (name === "search_concerns") return { data: [], error: null };
    if (name === "concern_message_changes") return { data: { messages: [], cursor: 2, hasMore: false }, error: null };
    throw new Error(`Unexpected RPC ${name}`);
  });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: state.mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class {
    record: typeof observers[number];
    constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) { this.record = { callback, root: options.root ?? null, nodes: new Set(), active: true }; observers.push(this.record); }
    observe(node: Element) { this.record.nodes.add(node); }
    disconnect() { this.record.active = false; }
  });
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(client);
  let control: ReturnType<typeof useConcernPanel> = null;
  function Page() { const [page, setPage] = useState("Home"); control = useConcernPanel(); return <main><h1>{page}</h1><button onClick={() => setPage("Team")}>Navigate within academy</button></main>; }
  const ui = () => <QueryClientProvider client={client}><ConcernPanelProvider><Page /></ConcernPanelProvider></QueryClientProvider>;
  const result = render(ui());
  return { ...result, client, ui, getControl: () => control };
}
async function openChat() {
  fireEvent.click(screen.getByRole("button", { name: "Open concerns" }));
  fireEvent.click(await screen.findByRole("button", { name: /Attendance follow-up/ }));
  await screen.findByLabelText("Message");
}
async function menu(seq = 1) {
  const item = document.querySelector(`[data-concern-seq="${seq}"]`)! as HTMLElement;
  fireEvent.keyDown(within(item).getByRole("button", { name: "Message actions" }), { key: "Enter" });
}

describe("floating concern panel consumers", () => {
  it("loads server unread totals collapsed, opens modeless, and persists chat/draft across academy page navigation and close", async () => {
    mount();
    await screen.findByLabelText("91 unread messages");
    expect(state.rpc.mock.calls.map(([name]) => name)).toEqual(["concern_unread"]);
    await openChat();
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).not.toBe("true");
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Keep my draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Navigate within academy" }));
    expect(screen.getByRole("heading", { name: "Team" })).toBeTruthy();
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("Keep my draft");
    fireEvent.click(screen.getByRole("button", { name: "Close concerns" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open concerns" })));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open concerns" }));
    expect((await screen.findByLabelText("Message") as HTMLTextAreaElement).value).toBe("Keep my draft");
    expect(state.rpc.mock.calls.filter(([name]) => name === "concern_messages_page")).toHaveLength(1);
  });

  it.each(["academy", "account", "preview"])("clears visible scope/cache and fences late detail activation on %s changes", async (transition) => {
    const mounted = mount();
    const late = deferred<{ data: ConcernDetail; error: null }>();
    state.rpc.mockImplementationOnce(async () => ({ data: { concerns: 1, messages: 1, mentions: 0 }, error: null }));
    state.rpc.mockImplementation((name) => name === "concern_detail" ? late.promise : Promise.resolve({ data: { concerns: 0, messages: 0, mentions: 0 }, error: null }));
    let activation!: Promise<unknown>;
    act(() => { activation = mounted.getControl()!.openConcern({ academyId: "academy-a", concernId: "late" }); });
    await screen.findByText("Opening concern…");
    if (transition === "academy") state.academyId = "academy-b";
    if (transition === "account") state.userId = "user-b";
    if (transition === "preview") advanceBrowserScope();
    mounted.rerender(mounted.ui());
    await act(async () => { late.resolve({ data: detail({ title: "Private old title" }), error: null }); await activation; });
    expect(screen.queryByText("Private old title")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(mounted.client.getQueryData(concernKeys.detail({ academyId: "academy-a", userId: "user-a" }, "late"))).toBeUndefined());
    expect(state.inboxLive.mock.calls.at(-1)?.[0]).toEqual({ academyId: state.academyId, userId: state.userId });
    const calls = state.rpc.mock.calls.length;
    await expect(mounted.getControl()!.openConcern({ academyId: "different-academy", concernId: "other" })).resolves.toBe("different_academy");
    expect(state.rpc.mock.calls).toHaveLength(calls);
  });

  it("rechecks notification-style activation even with cached detail, and denies before showing old content", async () => {
    const mounted = mount();
    mounted.client.setQueryData(concernKeys.detail({ academyId: "academy-a", userId: "user-a" }, "concern-1"), detail());
    state.rpc.mockImplementation(async (name) => name === "concern_detail" ? { data: null, error: { code: "42501" } } : { data: { concerns: 0, messages: 0, mentions: 0 }, error: null });
    await act(async () => { expect(await mounted.getControl()!.openConcern({ academyId: "academy-a", concernId: "concern-1" })).toBe("unavailable"); });
    expect(screen.getByText("You no longer have access to this concern.")).toBeTruthy();
    expect(screen.queryByText("Attendance follow-up")).toBeNull();
    expect(state.rpc.mock.calls.some(([name]) => name === "concern_messages_page")).toBe(false);
  });

  it("creates with active staff/whole-team snapshot and reuses both IDs after a failed attempt", async () => {
    mount();
    state.createConcern.mockResolvedValueOnce({ ok: false, code: "invalid_participant", message: "Someone you selected is no longer active staff." });
    fireEvent.click(screen.getByRole("button", { name: "Open concerns" }));
    fireEvent.click(await screen.findByRole("button", { name: "New concern" }));
    await screen.findByText("Omar");
    expect(screen.queryByText("Suspended")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Mona (you)" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Follow up" } });
    fireEvent.change(screen.getByLabelText("Opening message"), { target: { value: "Please check attendance" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Whole team" }));
    fireEvent.click(screen.getByRole("button", { name: "Create concern" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry creation" }));
    await screen.findByLabelText("Message");
    expect(state.createConcern).toHaveBeenCalledTimes(2);
    expect(state.createConcern.mock.calls[1][0]).toEqual(state.createConcern.mock.calls[0][0]);
    expect(state.createConcern.mock.calls[0][0]).toMatchObject({ academyId: "academy-a", title: "Follow up", body: "Please check attendance", wholeTeam: true });
  });

  it("keeps a failed send payload, retries its message ID, and merges success without replacing history", async () => {
    const mounted = mount(); await openChat();
    state.sendConcernMessage.mockResolvedValueOnce({ ok: false, code: "reply_unavailable", message: "The message you replied to was deleted." });
    const first = document.querySelector('[data-concern-seq="1"]');
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Check https://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry send" }));
    await screen.findByRole("link", { name: "https://example.com" });
    expect(state.sendConcernMessage.mock.calls[1][0]).toEqual(state.sendConcernMessage.mock.calls[0][0]);
    expect(document.querySelector('[data-concern-seq="1"]')).toBe(first);
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("");
    expect(mounted.client.getQueryData<ConcernThread>(concernKeys.thread({ academyId: "academy-a", userId: "user-a" }, "concern-1"))?.messages).toHaveLength(3);
  });

  it("offers author editing, preserves failed input, marks edits and clears deleted text/quotes", async () => {
    mount(); await openChat();
    await menu(); fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    state.editConcernMessage.mockResolvedValueOnce({ ok: false, code: "edit_expired", message: "Messages can only be edited within five minutes of sending." });
    fireEvent.change(screen.getByLabelText("Edit message"), { target: { value: "Corrected" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Messages can only be edited within five minutes of sending.");
    expect((screen.getByLabelText("Edit message") as HTMLTextAreaElement).value).toBe("Corrected");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Edited");
    expect(screen.getByText("Corrected")).toBeTruthy();
    await menu(); fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await screen.findByText("Message deleted");
    expect(screen.queryByText("Corrected")).toBeNull();
  });

  it("shows settled outcome, disables conversation writes, and still records only visible/focused receipts", async () => {
    currentDetail = detail({ status: "settled", outcome: "Attendance corrected", settledAt: stamp });
    mount(); await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Open concerns" })); });
    fireEvent.click(await screen.findByRole("button", { name: /Attendance follow-up/ }));
    await screen.findByText("Attendance corrected");
    expect(screen.queryByLabelText("Message")).toBeNull();
    expect(screen.queryByRole("button", { name: "Message actions" })).toBeNull();
    expect(state.markConcernRead).not.toHaveBeenCalled();
    const panel = screen.getByRole("dialog"); within(panel).getByRole("button", { name: "Close concerns" }).focus();
    act(() => emit(1));
    await waitFor(() => expect(state.markConcernRead).toHaveBeenCalledWith({ academyId: "academy-a", concernId: "concern-1", seq: 1 }));
    expect(state.markConcernRead.mock.calls.some(([input]) => input.seq === 2)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Navigate within academy" }));
    screen.getByRole("button", { name: "Navigate within academy" }).focus();
    act(() => emit(2));
    expect(state.markConcernRead).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close concerns" }));
    act(() => emit(2));
    expect(state.markConcernRead).toHaveBeenCalledTimes(1);
  });

  it("supports narrow modal focus/escape, receipt disclosure and generic advisory typing", async () => {
    state.mobile = true;
    mount(); await openChat();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.style.width).toBe("100%"); expect(dialog.style.height).toBe("100dvh");
    (document.querySelector("main button") as HTMLButtonElement).focus();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(screen.getByText("Typing activity")).toBeTruthy();
    expect(screen.queryByText("untrusted")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Read by Omar" }));
    await screen.findByText("Omar");
    expect(document.querySelector('time[datetime="' + stamp + '"]')).toBeTruthy();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open concerns" }));
  });

  it("omits manager creation for instructors and keeps list empty/error/search states distinct", async () => {
    state.role = "instructor"; mount();
    fireEvent.click(screen.getByRole("button", { name: "Open concerns" }));
    await screen.findByRole("button", { name: /Attendance follow-up/ });
    expect(screen.queryByRole("button", { name: "New concern" })).toBeNull();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Settled" }), { button: 0, ctrlKey: false });
    await screen.findByText("No settled concerns");
    fireEvent.change(screen.getByLabelText("Search concerns and messages"), { target: { value: "absent" } });
    await screen.findByText("No matching concerns or messages");
    expect(state.rpc.mock.calls.filter(([name]) => name === "search_concerns")).toHaveLength(1);
  });

  it("recovers a search error and jumps to a historical result without reading unseen newer messages", async () => {
    const original = state.rpc.getMockImplementation()!;
    let failed = true;
    const waiting = deferred<{ data: ConcernThread; error: null }>();
    state.rpc.mockImplementation((name, input) => {
      if (name === "search_concerns") return Promise.resolve(failed
        ? { data: null, error: { code: "42501" } }
        : { data: [{ concernId: "concern-1", title: "Historical concern", status: "ongoing", messageId: "message-1", seq: 1, body: "Historical text", authorName: "Mona", createdAt: stamp }], error: null });
      if (name === "concern_messages_page") {
        if (input.p_before_seq === 2) return waiting.promise;
        const before = Number(input.p_before_seq ?? 61);
        const all = Array.from({ length: 60 }, (_, index) => message(index + 1)).filter((item) => item.seq < before);
        return Promise.resolve({ data: { messages: all.slice(-50), cursor: 60, hasMore: all.length > 50 }, error: null });
      }
      return original(name, input);
    });
    mount(); fireEvent.click(screen.getByRole("button", { name: "Open concerns" }));
    fireEvent.change(await screen.findByLabelText("Search concerns and messages"), { target: { value: "history" } });
    await screen.findByText("Could not search concerns"); failed = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    fireEvent.click(await screen.findByRole("button", { name: /Historical concern/ }));
    await screen.findByText("Opening message…");
    act(() => emit(60)); expect(state.markConcernRead).not.toHaveBeenCalled();
    await act(async () => waiting.resolve({ data: { messages: [message(1)], cursor: 60, hasMore: false }, error: null }));
    await waitFor(() => expect(document.activeElement?.getAttribute("data-concern-message")).toBe("message-1"));
    expect(document.querySelectorAll("[data-concern-message]")).toHaveLength(60);
    act(() => emit(1));
    await waitFor(() => expect(state.markConcernRead).toHaveBeenCalledWith(expect.objectContaining({ seq: 1 })));
    expect(state.markConcernRead.mock.calls.some(([input]) => input.seq === 60)).toBe(false);
  });

  it("preserves replies, selects a participant mention and toggles reactions through real commands/cache", async () => {
    mount(); await openChat();
    await menu(); fireEvent.click(await screen.findByRole("menuitem", { name: "Reply" }));
    expect(screen.getByText("Reply to Mona")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Message")));
    fireEvent.click(screen.getByRole("button", { name: "Mention participant" }));
    const option = await screen.findByRole("option", { name: "Omar" });
    expect(option.isConnected).toBe(true);
    fireEvent.pointerDown(option, { button: 0, pointerType: "mouse", isPrimary: true });
    fireEvent.mouseDown(option, { button: 0 });
    fireEvent.mouseUp(option, { button: 0 });
    fireEvent.click(option);
    await waitFor(() => expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toContain("@Omar"));
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "@Omar please check" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(state.sendConcernMessage).toHaveBeenCalledWith(expect.objectContaining({ replyToId: "message-1", mentions: ["user-b"], body: "@Omar please check" })));
    const first = document.querySelector('[data-concern-seq="1"]')! as HTMLElement;
    fireEvent.click(within(first).getByRole("button", { name: "Add reaction" }));
    fireEvent.click(await screen.findByRole("button", { name: "React 👍" }));
    const reaction = await screen.findByRole("button", { name: "👍, 1 reactions" });
    expect(reaction.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(reaction);
    await waitFor(() => expect(screen.queryByRole("button", { name: "👍, 1 reactions" })).toBeNull());
    expect(state.setConcernReaction.mock.calls.map(([input]) => input.on)).toEqual([true, false]);
  });

  it("completes an in-flight send while collapsed without losing the attempt or reopening the panel", async () => {
    mount(); await openChat();
    const waiting = deferred<{ ok: true; message: ConcernMessage }>();
    state.sendConcernMessage.mockReturnValueOnce(waiting.promise);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Finish while closed" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Sending…");
    fireEvent.click(screen.getByRole("button", { name: "Close concerns" }));
    await act(async () => waiting.resolve({ ok: true, message: message(3, { body: "Finish while closed" }) }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open concerns" }));
    await screen.findByText("Finish while closed");
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("");
    expect(screen.queryByText("Sending…")).toBeNull();
    expect(state.sendConcernMessage).toHaveBeenCalledTimes(1);
  });


  it("keeps the mounted chat and draft through real TanStack child-route navigation", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(client);
    const root = createRootRoute({ component: () => <QueryClientProvider client={client}><ConcernPanelProvider><Outlet /></ConcernPanelProvider></QueryClientProvider> });
    const home = createRoute({ getParentRoute: () => root, path: "/home", component: () => <h1>Home route</h1> });
    const team = createRoute({ getParentRoute: () => root, path: "/team", component: () => <h1>Team route</h1> });
    const router = createRouter({ routeTree: root.addChildren([home, team]), history: createMemoryHistory({ initialEntries: ["/home"] }) });
    await router.load();
    render(<RouterProvider router={router} />);
    await screen.findByText("Home route"); await openChat();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Route draft" } });
    const original = screen.getByLabelText("Message");
    act(() => router.history.push("/team"));
    await screen.findByText("Team route");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByLabelText("Message")).toBe(original);
    expect((original as HTMLTextAreaElement).value).toBe("Route draft");
    expect(state.rpc.mock.calls.filter(([name]) => name === "concern_messages_page")).toHaveLength(1);
  });


  it("keeps inbox failures distinct from an empty list and retries only the failed read", async () => {
    const original = state.rpc.getMockImplementation()!;
    let failed = true;
    state.rpc.mockImplementation((name, input) => name === "concern_inbox" && failed
      ? Promise.resolve({ data: null, error: { code: "42501" } }) : original(name, input));
    mount(); fireEvent.click(screen.getByRole("button", { name: "Open concerns" }));
    await screen.findByText("Could not load concerns");
    expect(screen.queryByText("No ongoing concerns")).toBeNull();
    expect(screen.getByLabelText("Search concerns and messages")).toBeTruthy();
    failed = false; fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("button", { name: /Attendance follow-up/ });
    expect(state.rpc.mock.calls.filter(([name]) => name === "concern_unread")).toHaveLength(1);
  });

  it("locks an uncertain send payload through automatic/manual retry and panel collapse", async () => {
    mount(); await openChat();
    state.sendConcernMessage.mockResolvedValueOnce({ ok: false, code: "unavailable", message: "Could not reach the server." })
      .mockResolvedValueOnce({ ok: false, code: "unavailable", message: "Could not reach the server." })
      .mockResolvedValueOnce({ ok: false, code: "unavailable", message: "Could not reach the server." });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Keep the original payload" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByRole("button", { name: "Retry send" }, { timeout: 4000 });
    expect(screen.queryByRole("button", { name: "Edit message" })).toBeNull();
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Close concerns" }));
    fireEvent.click(screen.getByRole("button", { name: "Open concerns" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry send" }));
    await screen.findByText("Keep the original payload");
    expect(state.sendConcernMessage).toHaveBeenCalledTimes(4);
    const inputs = state.sendConcernMessage.mock.calls.map(([input]) => input);
    expect(inputs.every((input) => JSON.stringify(input) === JSON.stringify(inputs[0]))).toBe(true);
  });

});
