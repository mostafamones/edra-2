import { useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { formatDuration } from "../media";
import { ConcernIconButton } from "./icon-button";

const SPEEDS = [1, 1.5, 2] as const;

/**
 * Voice-note playback with seeking and 1×/1.5×/2× speed. Recorder WebM often reports an infinite
 * duration, so the verified (or recorded) length is the fallback for the seek range.
 */
export function ConcernVoicePlayer({ src, durationSeconds, downloadUrl }: { src: string; durationSeconds: number | null; downloadUrl?: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [length, setLength] = useState(durationSeconds ?? 0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [failed, setFailed] = useState(false);
  const toggle = () => {
    const element = audio.current;
    if (!element) return;
    if (element.paused) element.play().catch(() => setFailed(true)); else element.pause();
  };
  const cycle = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audio.current) audio.current.playbackRate = next;
  };
  if (failed) return <p role="alert" className="text-sm text-muted-foreground">This voice note cannot play here.{downloadUrl && <> <a href={downloadUrl} className="underline underline-offset-2">Download</a></>}</p>;
  return <div className="flex w-full max-w-80 items-center gap-2 rounded-lg border px-2 py-1">
    <audio ref={audio} src={src} preload="metadata" className="hidden"
      onLoadedMetadata={(event) => { const value = event.currentTarget.duration; if (Number.isFinite(value) && value > 0) setLength(value); event.currentTarget.playbackRate = speed; }}
      onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setPosition(0); }}
      onError={() => setFailed(true)} />
    <ConcernIconButton label={playing ? "Pause voice note" : "Play voice note"} icon={playing ? PauseIcon : PlayIcon} onClick={toggle} />
    <Slider className="min-w-16 flex-1" min={0} max={Math.max(length, 0.1)} step={0.1} value={[Math.min(position, length)]}
      // The shadcn slider forwards no label to its thumb, which Radix renders after mount; name it.
      ref={(node: HTMLSpanElement | null) => { if (node) requestAnimationFrame(() => node.querySelector('[role="slider"]')?.setAttribute("aria-label", "Seek voice note")); }}
      onValueChange={([value]) => { setPosition(value); if (audio.current) audio.current.currentTime = value; }} />
    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDuration(position)} / {formatDuration(length)}</span>
    <Button type="button" variant="ghost" size="sm" className="shrink-0 px-2 tabular-nums" aria-label={`Playback speed ${speed}×`} onClick={cycle}>{speed}×</Button>
  </div>;
}
