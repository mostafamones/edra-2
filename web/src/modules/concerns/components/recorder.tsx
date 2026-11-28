import { useEffect, useRef, useState } from "react";
import { Cancel01Icon, Delete02Icon, Mic01Icon, StopIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { CONCERN_LIMITS } from "../contracts";
import { formatDuration } from "../media";
import { ConcernIconButton } from "./icon-button";
import { ConcernVoicePlayer } from "./voice";

/**
 * Recorder formats the server can measure, in preference order: Opus in WebM (Chromium, Edge,
 * Firefox, Safari 18.4+) or Ogg (Firefox). Browsers that can only record MP4/AAC (older Safari)
 * are told voice notes are unsupported rather than producing a file the server would refuse.
 */
const FORMATS = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus"];
const EXTENSIONS: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg" };
/** Stop early enough that container timing overhead keeps the take within the server's exact limit. */
const STOP_AT_SECONDS = CONCERN_LIMITS.voiceSeconds - 2;

export function concernVoiceFormat(): string | null {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  return FORMATS.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

function microphoneProblem(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access is blocked. Allow it for this site, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone was found.";
  if (name === "NotReadableError" || name === "AbortError") return "The microphone is unavailable. Close other apps using it and try again.";
  return "Could not start recording.";
}

type Active = { recorder: MediaRecorder | null; stream: MediaStream | null; timer: number | null; url: string | null };
/** Stops the recorder and microphone and frees the review URL. */
function releaseRecording(active: { current: Active }) {
  const current = active.current;
  if (current.timer !== null) window.clearInterval(current.timer);
  if (current.recorder && current.recorder.state !== "inactive") current.recorder.stop();
  current.stream?.getTracks().forEach((track) => track.stop());
  if (current.url) URL.revokeObjectURL(current.url);
  active.current = { recorder: null, stream: null, timer: null, url: null };
}

type Review = { blob: Blob; url: string; seconds: number; type: string };
type State = { status: "idle" | "requesting" | "recording" } | { status: "review"; review: Review } | { status: "error"; message: string };

/**
 * Records one voice note (up to five minutes), then offers review, playback, discard or attach.
 * Closing, collapsing the panel or leaving the concern stops the microphone and discards the take.
 */
export function ConcernRecorder({ onAttach, onClose }: { onAttach: (voice: { blob: Blob; name: string; durationSeconds: number }) => void; onClose: () => void }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [elapsed, setElapsed] = useState(0);
  const session = useRef(0);
  const active = useRef<Active>({ recorder: null, stream: null, timer: null, url: null });

  const release = () => releaseRecording(active);

  useEffect(() => {
    // Recover from a denied prompt once the person allows the microphone in browser settings.
    let status: PermissionStatus | null = null;
    const changed = () => { if (status?.state !== "denied") setState((current) => current.status === "error" ? { status: "idle" } : current); };
    navigator.permissions?.query({ name: "microphone" as PermissionName }).then((result) => { status = result; result.addEventListener("change", changed); }, () => {});
    return () => {
      status?.removeEventListener("change", changed);
      session.current += 1;
      releaseRecording(active);
      setState({ status: "idle" });
    };
  }, []);

  async function start() {
    const type = concernVoiceFormat();
    if (!type) { setState({ status: "error", message: "Voice notes are not supported in this browser." }); return; }
    const token = ++session.current;
    release();
    setState({ status: "requesting" }); setElapsed(0);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      if (token === session.current) setState({ status: "error", message: microphoneProblem(error) });
      return;
    }
    // Closed or restarted while the permission prompt was open: release the late stream at once.
    if (token !== session.current) { stream.getTracks().forEach((track) => track.stop()); return; }
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: type });
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setState({ status: "error", message: "Voice notes are not supported in this browser." });
      return;
    }
    const chunks: Blob[] = [];
    const began = performance.now();
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
    recorder.onerror = () => {
      if (token !== session.current) return;
      session.current += 1; release();
      setState({ status: "error", message: "Recording failed. Try again." });
    };
    recorder.onstop = () => {
      if (token !== session.current) return;
      const seconds = Math.min((performance.now() - began) / 1000, STOP_AT_SECONDS);
      const recorded = (recorder.mimeType || type).split(";")[0];
      const blob = new Blob(chunks, { type: recorded });
      const current = active.current;
      if (current.timer !== null) window.clearInterval(current.timer);
      current.stream?.getTracks().forEach((track) => track.stop());
      if (blob.size === 0) { active.current = { recorder: null, stream: null, timer: null, url: null }; setState({ status: "error", message: "Nothing was recorded. Try again." }); return; }
      const url = URL.createObjectURL(blob);
      active.current = { recorder: null, stream: null, timer: null, url };
      setState({ status: "review", review: { blob, url, seconds, type: recorded } });
    };
    const timer = window.setInterval(() => {
      const seconds = (performance.now() - began) / 1000;
      setElapsed(seconds);
      // The server measures the stored recording itself; this stop keeps takes within its limit.
      if (seconds >= STOP_AT_SECONDS && recorder.state === "recording") recorder.stop();
    }, 250);
    active.current = { recorder, stream, timer, url: null };
    recorder.start(1000);
    setState({ status: "recording" });
  }

  const stop = () => { if (active.current.recorder?.state === "recording") active.current.recorder.stop(); };
  const discard = () => { session.current += 1; release(); setState({ status: "idle" }); };
  const close = () => { discard(); onClose(); };

  return <div className="space-y-2 rounded-lg border p-2" role="group" aria-label="Voice note">
    {state.status === "review" ? <>
      <ConcernVoicePlayer src={state.review.url} durationSeconds={state.review.seconds} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => {
          const { blob, seconds, type } = state.review;
          onAttach({ blob, name: `Voice note ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).replace(/[^\w ]/g, "-")}.${EXTENSIONS[type] ?? "webm"}`, durationSeconds: seconds });
          close();
        }}><HugeIcon icon={Tick02Icon} />Attach</Button>
        <Button type="button" size="sm" variant="outline" onClick={discard}><HugeIcon icon={Delete02Icon} />Discard</Button>
      </div>
    </> : <div className="flex items-center gap-2">
      {state.status === "recording"
        ? <><span className="size-2 shrink-0 animate-pulse rounded-full bg-destructive" aria-hidden="true" />
          <span role="timer" aria-label="Recording time" className="text-sm tabular-nums">{formatDuration(elapsed)} / {formatDuration(STOP_AT_SECONDS)}</span>
          <div className="flex-1" /><ConcernIconButton label="Stop recording" icon={StopIcon} onClick={stop} /></>
        : <><Button type="button" size="sm" variant="outline" disabled={state.status === "requesting"} onClick={() => void start()}>
          <HugeIcon icon={Mic01Icon} />{state.status === "requesting" ? "Waiting for microphone…" : state.status === "error" ? "Try again" : "Record"}</Button><div className="flex-1" /></>}
      <ConcernIconButton label="Cancel voice note" icon={Cancel01Icon} onClick={close} />
    </div>}
    {state.status === "error" && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
  </div>;
}

function HugeIcon({ icon }: { icon: Parameters<typeof HugeiconsIcon>[0]["icon"] }) {
  return <HugeiconsIcon icon={icon} strokeWidth={1.5} aria-hidden="true" />;
}
