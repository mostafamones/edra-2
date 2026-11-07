// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { advanceBrowserScope } from "@/lib/browser-scope";
import type { ConcernAttachment } from "../contracts";
import type { ConcernDetail, ConcernMessage } from "../validation";
import { ConcernPanelProvider } from "./panel";

const state = vi.hoisted(() => ({
  rpc: vi.fn(), send: vi.fn(), start: vi.fn(), finish: vi.fn(), discard: vi.fn(), upload: vi.fn(),
}));
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "user-a" }, activeAcademy: { id: "academy-a", role: "admin" } }) }));
vi.mock("@/modules/account/browser", () => ({ accountName: () => "", resolveProfileAvatars: vi.fn(async () => ({})) }));
vi.mock("@/modules/staff", () => ({ fetchTeamMembers: vi.fn(async () => []), staffQueryKeys: { members: () => ["staff"] } }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc: state.rpc }) }));
vi.mock("../actions", () => ({ sendConcernMessage: state.send, markConcernRead: vi.fn(async ({ seq }) => ({ ok: true, lastReadSeq: seq, readAt: null })) }));
vi.mock("../media-actions", () => ({ startConcernUpload: state.start, finishConcernUpload: state.finish, discardConcernUpload: state.discard }));
vi.mock("../upload", () => ({ uploadToSignedUrl: state.upload }));
vi.mock("../live", () => ({ useConcernLive: () => ({ status: "live", typers: [], reconnect: vi.fn() }), useConcernInboxLive: () => ({ status: "live" }) }));

const stamp = new Date().toISOString();
const voice: ConcernAttachment = { id: "voice-1", name: "Voice note.webm", contentType: "audio/webm", bytes: 900, kind: "voice", durationSeconds: 42 };
const pdf: ConcernAttachment = { id: "pdf-1", name: "plan.pdf", contentType: "application/pdf", bytes: 2048, kind: "file", durationSeconds: null };
const image: ConcernAttachment = { id: "img-1", name: "board.png", contentType: "image/png", bytes: 4096, kind: "file", durationSeconds: null };
const other: ConcernAttachment = { id: "zip-1", name: "page.html", contentType: "application/octet-stream", bytes: 10, kind: "file", durationSeconds: null };
function message(seq: number, extra: Partial<ConcernMessage> = {}): ConcernMessage {
  return { id: `message-${seq}`, concernId: "concern-1", seq, revision: seq, body: `Message ${seq}`, authorId: "user-a", authorName: "Mona", mentions: [], createdAt: stamp, editedAt: null, deletedAt: null, replyTo: null, reactions: [], attachments: [], ...extra };
}
const detail: ConcernDetail = { id: "concern-1", title: "Attendance follow-up", status: "ongoing", createdAt: stamp, createdBy: "user-a", settledAt: null, outcome: null, lastSeq: 2, muted: false,
  version: 1, settledBy: null, settledByName: null, canManage: true, participants: [{ userId: "user-a", name: "Mona", avatarPath: null, lastReadSeq: 0, readAt: null }] };
let messages: ConcernMessage[];
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { resolve, promise }; }

beforeEach(() => {
  vi.clearAllMocks();
  messages = [message(1)];
  state.rpc.mockImplementation(async (name: string) => {
    if (name === "concern_unread") return { data: { concerns: 0, messages: 0, mentions: 0 }, error: null };
    if (name === "concern_detail") return { data: detail, error: null };
    if (name === "concern_messages_page") return { data: { messages, hasMore: false, cursor: 2 }, error: null };
    if (name === "concern_inbox") return { data: { concerns: [{ id: "concern-1", title: "Attendance follow-up", status: "ongoing", updatedAt: stamp, muted: false, lastReadSeq: 0, unread: 0, unreadMentions: 0,
      last: { seq: 2, authorId: "user-a", authorName: "Mona", body: null, deleted: false, createdAt: stamp, media: { count: 1, voice: true } } }], hasMore: false }, error: null };
    if (name === "concern_message_changes") return { data: { messages: [], cursor: 2, hasMore: false }, error: null };
    throw new Error(`Unexpected RPC ${name}`);
  });
  state.start.mockResolvedValue({ ok: true, url: "https://upload.test/once" });
  state.upload.mockResolvedValue("uploaded");
  state.finish.mockImplementation(async ({ attachmentId }) => ({ ok: true, attachment: { ...pdf, id: attachmentId } }));
  state.discard.mockResolvedValue({ ok: true });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function openChat() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const view = render(<QueryClientProvider client={client}><ConcernPanelProvider><main /></ConcernPanelProvider></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Open concerns" }));
  fireEvent.click(await screen.findByRole("button", { name: /Attendance follow-up/ }));
  await screen.findByLabelText("Message");
  return { ...view, client };
}
const picker = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;
function choose(...files: File[]) { fireEvent.change(picker(), { target: { files } }); }

describe("concern media consumers", () => {
  it("previews media in the inbox, renders media-only messages as media and keeps deletion placeholders separate", async () => {
    messages = [
      message(1, { body: null, attachments: [voice, pdf, image, other] }),
      message(2, { replyTo: { id: "message-1", seq: 1, authorId: "user-a", authorName: "Mona", body: null, deleted: false, media: { count: 4, voice: true } } }),
      message(3, { body: null, deletedAt: stamp }),
    ];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    render(<QueryClientProvider client={client}><ConcernPanelProvider><main /></ConcernPanelProvider></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Open concerns" }));
    expect(await screen.findByText("Voice note")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Attendance follow-up/ }));
    await screen.findByRole("button", { name: "Play voice note" });
    const first = document.querySelector('[data-concern-seq="1"]') as HTMLElement;
    expect(within(first).queryByText("Message deleted")).toBeNull();
    expect(within(first).getByRole("button", { name: "Play voice note" })).toBeTruthy();
    expect(within(first).getByRole("link", { name: "Open" }).getAttribute("href")).toBe("/api/concerns/academy-a/concern-1/pdf-1");
    expect(within(first).getByRole("img", { name: "board.png" }).getAttribute("src")).toBe("/api/concerns/academy-a/concern-1/img-1");
    expect(within(first).getByRole("link", { name: "Download page.html" }).getAttribute("href")).toBe("/api/concerns/academy-a/concern-1/zip-1?download=1");
    expect(within(document.querySelector('[data-concern-seq="2"]') as HTMLElement).getByText("Voice note and 3 more")).toBeTruthy();
    expect(screen.getAllByText("Message deleted")).toHaveLength(1);
    // Voice playback speed cycles 1× → 1.5× → 2× on the real media element.
    fireEvent.click(within(first).getByRole("button", { name: "Playback speed 1×" }));
    fireEvent.click(within(first).getByRole("button", { name: "Playback speed 1.5×" }));
    expect(within(first).getByRole("button", { name: "Playback speed 2×" })).toBeTruthy();
    expect(first.querySelector("audio")!.playbackRate).toBe(2);
  });

  it("uploads with progress, sends a media-only message and retries the uncertain send with the same ids", async () => {
    await openChat();
    const transfer = deferred<"uploaded">();
    state.upload.mockImplementationOnce(async (_url: string, _blob: Blob, _signal: AbortSignal, progress: (value: number) => void) => { progress(0.5); return transfer.promise; });
    choose(new File(["%PDF-1.7"], "plan.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("Uploading 50%")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => transfer.resolve("uploaded"));
    await screen.findByText("8 B");
    const attachmentId = state.start.mock.calls[0][0].attachmentId;
    expect(state.finish).toHaveBeenCalledWith(expect.objectContaining({ attachmentId }));
    state.send.mockResolvedValue({ ok: false, code: "unavailable", message: "Could not reach the server. Check your connection and try again." });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    const retry = await screen.findByRole("button", { name: "Retry send" }, { timeout: 5000 });
    expect(screen.queryByRole("button", { name: "Remove attachment" })).toBeNull();
    state.send.mockImplementation(async (input) => ({ ok: true, message: message(2, { id: input.messageId, body: null, attachments: [{ ...pdf, id: attachmentId }] }) }));
    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole("list", { name: "Attachments to send" })).toBeNull());
    const ids = new Set(state.send.mock.calls.map(([input]) => input.messageId));
    expect(ids.size).toBe(1);
    expect(state.send.mock.calls.every(([input]) => input.body === null && input.attachmentIds.length === 1 && input.attachmentIds[0] === attachmentId)).toBe(true);
    expect(state.discard).not.toHaveBeenCalled();
  }, 10000);

  it("checks limits, retries failed uploads with the same id and discards canceled uploads", async () => {
    await openChat();
    choose(...Array.from({ length: 11 }, (_, index) => new File(["x"], `f${index}.txt`)));
    expect((await screen.findByRole("alert")).textContent).toBe("Up to 10 attachments per message.");
    const big = new File(["x"], "video.mov");
    Object.defineProperty(big, "size", { value: 25 * 1024 * 1024 + 1 });
    choose(big);
    expect(await screen.findByText("video.mov is larger than 25 MB.")).toBeTruthy();
    expect(state.start).not.toHaveBeenCalled();

    state.upload.mockResolvedValueOnce("failed");
    choose(new File(["data"], "notes.txt"));
    fireEvent.click(await screen.findByRole("button", { name: "Retry upload" }));
    await waitFor(() => expect(state.finish).toHaveBeenCalledTimes(1));
    expect(state.start.mock.calls[1][0].attachmentId).toBe(state.start.mock.calls[0][0].attachmentId);
    fireEvent.click(await screen.findByRole("button", { name: "Remove attachment" }));
    expect(state.discard).toHaveBeenCalledWith(expect.objectContaining({ attachmentId: state.start.mock.calls[0][0].attachmentId }));

    // A definite refusal renews the id on retry instead of reusing a removed reservation.
    state.finish.mockResolvedValueOnce({ ok: false, code: "attachment_unavailable", message: "This attachment is no longer available. Remove it and try again." });
    choose(new File(["data"], "again.txt"));
    fireEvent.click(await screen.findByRole("button", { name: "Retry upload" }));
    await waitFor(() => expect(state.start).toHaveBeenCalledTimes(4));
    expect(state.start.mock.calls[3][0].attachmentId).not.toBe(state.start.mock.calls[2][0].attachmentId);
  });

  it("verifies already stored bytes on a retried upload without sending them again", async () => {
    await openChat();
    state.upload.mockResolvedValueOnce("failed");
    choose(new File(["data"], "stored.txt"));
    const retry = await screen.findByRole("button", { name: "Retry upload" });
    state.start.mockResolvedValueOnce({ ok: true, url: null });
    fireEvent.click(retry);
    await screen.findByRole("button", { name: "Remove attachment" });
    expect(state.upload).toHaveBeenCalledTimes(1);
    const id = state.start.mock.calls[0][0].attachmentId;
    expect(state.start.mock.calls[1][0].attachmentId).toBe(id);
    expect(state.finish).toHaveBeenCalledWith(expect.objectContaining({ attachmentId: id }));
  });

  it("ignores upload results from a previous browser scope", async () => {
    await openChat();
    const started = deferred<{ ok: true; url: string }>();
    state.start.mockReturnValueOnce(started.promise);
    choose(new File(["data"], "late.txt"));
    await waitFor(() => expect(state.start).toHaveBeenCalled());
    act(() => advanceBrowserScope());
    await act(async () => started.resolve({ ok: true, url: "https://upload.test/late" }));
    expect(state.upload).not.toHaveBeenCalled();
    expect(state.finish).not.toHaveBeenCalled();
  });
});

describe("voice recorder", () => {
  function microphone() {
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    return { track, stream };
  }
  class FakeRecorder {
    static isTypeSupported = vi.fn((type: string) => type === "audio/webm;codecs=opus");
    state = "inactive"; mimeType = "audio/webm;codecs=opus";
    ondataavailable: ((event: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null; onerror: (() => void) | null = null;
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["opus"], { type: "audio/webm" }) }); this.onstop?.(); }
  }

  it("explains unsupported browsers and blocked microphones, recovering on another attempt", async () => {
    vi.stubGlobal("MediaRecorder", undefined);
    await openChat();
    fireEvent.click(screen.getByRole("button", { name: "Record voice note" }));
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Voice notes are not supported in this browser.");
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const getUserMedia = vi.fn().mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Microphone access is blocked. Allow it for this site, then try again.");
    const { stream } = microphone();
    getUserMedia.mockResolvedValueOnce(stream);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Stop recording" })).toBeTruthy();
  });

  it("reviews before attaching, releases the microphone and uploads the take as a voice note", async () => {
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const { track, stream } = microphone();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    URL.createObjectURL = vi.fn(() => "blob:take");
    URL.revokeObjectURL = vi.fn();
    state.finish.mockImplementation(async ({ attachmentId }) => ({ ok: true, attachment: { ...voice, id: attachmentId } }));
    await openChat();
    fireEvent.click(screen.getByRole("button", { name: "Record voice note" }));
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop recording" }));
    expect(track.stop).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Play voice note" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    await waitFor(() => expect(state.start).toHaveBeenCalledWith(expect.objectContaining({ kind: "voice", name: expect.stringMatching(/^Voice note .*\.webm$/) })));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:take");
    expect(await screen.findByRole("list", { name: "Attachments to send" })).toBeTruthy();
  });

  it("releases a microphone granted after the recorder was canceled", async () => {
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const { track, stream } = microphone();
    const granted = deferred<MediaStream>();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(() => granted.promise) } });
    await openChat();
    fireEvent.click(screen.getByRole("button", { name: "Record voice note" }));
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(await screen.findByText("Waiting for microphone…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel voice note" }));
    await act(async () => granted.resolve(stream));
    expect(track.stop).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Stop recording" })).toBeNull();
  });
});
