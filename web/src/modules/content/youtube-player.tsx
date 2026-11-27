import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { youtubeWatchUrl } from "./youtube";

type Player = { seekTo(seconds: number, allowSeekAhead: boolean): void; destroy(): void; getDuration(): number; getCurrentTime(): number; getPlaybackRate(): number; getPlayerState(): number };
type PlayerEvent = { target: Player; data: number };
type YoutubeApi = { Player: new (frame: HTMLIFrameElement, options: { events: { onReady: (event: PlayerEvent) => void; onError: (event: PlayerEvent) => void; onStateChange: (event: PlayerEvent) => void } }) => Player };
type YoutubeWindow = Window & { YT?: YoutubeApi; onYouTubeIframeAPIReady?: () => void };
let apiPromise: Promise<YoutubeApi> | undefined;

function loadPlayer() {
  const win = window as YoutubeWindow;
  if (win.YT?.Player) return Promise.resolve(win.YT);
  if (!apiPromise) apiPromise = new Promise<YoutubeApi>((resolve, reject) => {
    const script = document.createElement("script");
    const previous = win.onYouTubeIframeAPIReady;
    const timer = window.setTimeout(failed, 9000);
    function clean() { window.clearTimeout(timer); win.onYouTubeIframeAPIReady = previous; }
    function failed() { clean(); script.remove(); reject(new Error("YouTube playback tracking is unavailable.")); }
    win.onYouTubeIframeAPIReady = () => { if (!win.YT?.Player) return failed(); clean(); resolve(win.YT); previous?.(); };
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = failed;
    document.head.append(script);
  }).catch(error => { apiPromise = undefined; throw error; });
  return apiPromise;
}

export type YoutubeSample = { position: number; rate: number; playing: boolean };

export function YoutubePlayer({ id, title, start = 0, onDuration, onSample, onCheckpoint, seek, responsive }: {
  id: string; title: string; start?: number; onDuration?: (seconds: number) => void;
  seek?: { seconds: number }; responsive?: boolean;
  onSample?: (value: YoutubeSample) => void; onCheckpoint?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const readyPlayer = useRef<Player>(null);
  const startAt = useRef(start);
  const [failure, setFailure] = useState<"embed" | "tracking" | null>(null);
  const durationReported = useEffectEvent((value: number) => onDuration?.(value));
  const sampleReported = useEffectEvent((sample: YoutubeSample) => onSample?.(sample));
  const checkpoint = useEffectEvent(() => onCheckpoint?.());
  const seekOnReady = useEffectEvent((player: Player) => { if (seek) player.seekTo(seek.seconds, true); });
  useEffect(() => { if (seek) readyPlayer.current?.seekTo(seek.seconds, true); }, [seek]);
  useEffect(() => {
    if (!host.current) return;
    const frame = document.createElement("iframe");
    const url = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
    url.search = new URLSearchParams({ enablejsapi: "1", origin: location.origin, playsinline: "1", rel: "0", ...(startAt.current >= 1 ? { start: String(Math.floor(startAt.current)) } : {}) }).toString();
    frame.title = title;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.allowFullscreen = true;
    frame.className = "block size-full border-0";
    frame.src = url.href;
    const container = host.current;
    container.replaceChildren(frame);
    let mounted = true, player: Player | undefined, ready = false, lastDuration = 0;
    function read(playing?: boolean) {
      if (!player || !ready) return;
      const duration = player.getDuration();
      if (duration > 0 && duration !== lastDuration) { lastDuration = duration; durationReported(duration); }
      sampleReported({ position: player.getCurrentTime(), rate: player.getPlaybackRate(), playing: playing ?? player.getPlayerState() === 1 });
    }
    const timeout = window.setTimeout(() => { if (!ready) setFailure("tracking"); }, 14000);
    const poll = window.setInterval(() => read(), 500);
    void loadPlayer().then(api => {
      if (!mounted) return;
      player = new api.Player(frame, { events: {
        onReady: ({ target }) => { if (!mounted) return; player = target; readyPlayer.current = target; ready = true; setFailure(null); seekOnReady(target); read(false); },
        onError: () => { if (!mounted) return; read(false); ready = false; readyPlayer.current = null; setFailure("embed"); checkpoint(); },
        onStateChange: ({ data }) => { if (!mounted) return; read(data === 1); if ([0, 2, 3].includes(data)) checkpoint(); },
      } });
    }).catch(() => { if (mounted) setFailure("tracking"); });
    return () => { mounted = false; readyPlayer.current = null; clearInterval(poll); clearTimeout(timeout); player?.destroy(); container.replaceChildren(); };
  }, [id, title]);
  return <div>
    <div ref={host} className={`aspect-video w-full bg-black ${responsive ? "" : "min-h-[200px]"}`} />
    {failure && <div className="flex flex-wrap items-center gap-2 bg-background p-3 text-sm" role="status">
      <span>{failure === "embed" ? "YouTube couldn’t play this video here." : "Playback tracking is unavailable."}</span>
      <Button asChild variant="outline" size="sm"><a href={youtubeWatchUrl(id, seek?.seconds ?? start)} target="_blank" rel="noopener noreferrer">Open on YouTube</a></Button>
    </div>}
  </div>;
}
