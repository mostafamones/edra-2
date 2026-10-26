"use client";
import { useEffect, useRef, useState } from "react";
import MuxPlayer from "@mux/mux-player-react";
import type MuxPlayerElement from "@mux/mux-player";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { unwrapContent } from "../types";
import { saveVideoProgress, startVideoProgress } from "./actions";
import { PlaybackCoverage } from "./coverage";
import type { ProgressSession } from "./types";

type Props = { academyId: string; unitId: string; itemId: string; title: string; playbackId: string;
  tokens: { playback: string; thumbnail: string; storyboard: string } };

export function LearningVideo(props: Props) {
  const [session, setSession] = useState<ProgressSession | null>(null), [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    startVideoProgress({ academyId: props.academyId, unitId: props.unitId, itemId: props.itemId })
      .then(result => { const value = unwrapContent(result); if (active) { setSession(value); setError(""); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Could not load playback progress."); });
    return () => { active = false; };
  }, [props.academyId, props.unitId, props.itemId, attempt]);
  if (!session) return error ? <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => { setError(""); setAttempt(n => n + 1); }}>Retry</Button></div> : <p role="status">Loading video…</p>;
  return <TrackedVideo key={session.sessionId} {...props} session={session} />;
}

function TrackedVideo({ session, ...props }: Props & { session: ProgressSession }) {
  const cache = useQueryClient();
  const player = useRef<MuxPlayerElement>(null);
  const [error, setError] = useState("");
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const checkpoint = useRef({ saving: false, requested: false, sequence: 0 });
  const coverage = useRef(new PlaybackCoverage(session.durationSeconds, session.positionSeconds));
  const active = useRef(false), seeking = useRef(false);
  const hasPlayed = useRef(false);
  const completed = useRef<boolean | null>(null);
  function sample(playing = active.current) {
    const video = player.current;
    // Mux emits startup time/pause events at zero before applying startTime.
    // Those events must not replace the acknowledged resume position.
    if (video && hasPlayed.current) coverage.current.sample(video.currentTime, performance.now(), playing && !seeking.current, video.playbackRate);
  }
  useEffect(() => {
    let mounted = true, lastNotified = 0;
    const tracker = coverage.current;
    const writes = checkpoint.current;
    async function flush() {
      if (writes.saving) { writes.requested = true; return; }
      const ranges = tracker.take();
      // No more than 100 disjoint intervals per checkpoint; retain overflow for the next one.
      const batch = ranges.slice(0, 100);
      tracker.restore(ranges.slice(100));
      writes.saving = true;
      try {
        const saved = unwrapContent(await saveVideoProgress({ academyId: props.academyId, unitId: props.unitId,
          sessionId: session.sessionId, sequence: ++writes.sequence, position: tracker.position, ranges: batch }));
        if (mounted) setError("");
        if (completed.current !== saved.completed || !active.current || Date.now() - lastNotified >= 15000) {
          completed.current = saved.completed;
          lastNotified = Date.now();
          void cache.invalidateQueries({ queryKey: ["learning"] });
        }
      } catch (e) {
        tracker.restore(batch);
        if (mounted) setError(e instanceof Error ? e.message : "Progress could not be saved.");
      } finally {
        writes.saving = false;
        if (writes.requested) { writes.requested = false; void flushRef.current(); }
      }
    }
    flushRef.current = flush;
    const timer = setInterval(() => { if (active.current) void flush(); }, 5000);
    function leaving() { void flush(); }
    document.addEventListener("visibilitychange", leaving);
    window.addEventListener("pagehide", leaving);
    return () => {
      mounted = false; clearInterval(timer);
      document.removeEventListener("visibilitychange", leaving); window.removeEventListener("pagehide", leaving);
      void flush();
    };
  }, [props.academyId, props.unitId, session.sessionId, cache]);
  return <><MuxPlayer ref={player} className="max-h-[70dvh] w-full" style={{ height: "min(60dvh, 32rem)" }} playbackId={props.playbackId} tokens={props.tokens} metadata={{ video_title: props.title }}
    streamType="on-demand" autoPlay={false} startTime={session.positionSeconds}
    onPlaying={() => { hasPlayed.current = true; active.current = true; coverage.current.reset(); sample(); }}
    onTimeUpdate={() => sample()}
    onSeeking={() => { seeking.current = true; coverage.current.reset(); }}
    onSeeked={() => { seeking.current = false; coverage.current.reset(); sample(); void flushRef.current(); }}
    onRateChange={() => { coverage.current.reset(); sample(); }}
    onWaiting={() => { sample(); active.current = false; coverage.current.reset(); }}
    onPause={() => { sample(); active.current = false; coverage.current.reset(); void flushRef.current(); }}
    onEnded={() => { sample(); active.current = false; coverage.current.reset(); void flushRef.current(); }} />
    {error && <div role="alert" className="flex items-center gap-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" size="sm" onClick={() => void flushRef.current()}>Retry save</Button></div>}
  </>;
}
