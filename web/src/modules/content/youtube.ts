export const youtubeIdPattern = /^[A-Za-z0-9_-]{11}$/;
export const maxYoutubeDuration = 43_200;

/** Only canonical video IDs enter storage, outbound links, or iframe URLs. */
export function youtubeIdFromUrl(value: string): string | null {
  let url: URL;
  try { url = new URL(value.trim()); } catch { return null; }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return null;
  let id: string | null = null;
  if (url.hostname === "youtu.be") id = /^\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  else if (["youtube.com", "www.youtube.com", "m.youtube.com", "www.youtube-nocookie.com"].includes(url.hostname)) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else id = /^\/(?:embed|shorts|live)\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  }
  return id && youtubeIdPattern.test(id) ? id : null;
}

export function youtubeWatchUrl(id: string, seconds = 0) {
  const url = new URL("https://www.youtube.com/watch");
  url.searchParams.set("v", id);
  if (seconds > 0) url.searchParams.set("t", `${Math.floor(seconds)}s`);
  return url.href;
}

export function formatVideoDuration(seconds: number) {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const tail = String(total % 60).padStart(2, "0");
  return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${tail}` : `${minutes}:${tail}`;
}
