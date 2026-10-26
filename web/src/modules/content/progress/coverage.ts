export type WatchedRange = [number, number];

/** Union timeline sections: replayed seconds never count twice. */
export function mergeWatched(ranges: WatchedRange[]): WatchedRange[] {
  const sorted = ranges.filter(([from, to]) => Number.isFinite(from) && Number.isFinite(to) && from >= 0 && to > from)
    .map(([from, to]): WatchedRange => [from, to]).sort((a, b) => a[0] - b[0]);
  const merged: WatchedRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push(range);
  }
  return merged;
}

/** Time jumps, seeks, pauses and buffering do not produce watched coverage. */
export class PlaybackCoverage {
  private previous: { position: number; time: number } | null = null;
  private ranges: WatchedRange[] = [];
  position = 0;
  constructor(private readonly duration: number, position = 0) { this.position = Math.min(position, duration); }
  reset() { this.previous = null; }
  sample(position: number, time: number, playing: boolean, rate: number) {
    if (!Number.isFinite(position)) return;
    position = Math.max(0, Math.min(position, this.duration));
    const previous = this.previous;
    this.position = position;
    if (playing && previous) {
      const delta = position - previous.position, elapsed = (time - previous.time) / 1000;
      // The small tolerance accommodates media-clock rounding, not a seek.
      if (elapsed > 0 && elapsed <= 3 && delta > 0 && delta <= elapsed * Math.max(0.25, rate) + 0.35) {
        this.ranges = mergeWatched([...this.ranges, [previous.position, position]]);
      }
    }
    this.previous = playing ? { position, time } : null;
  }
  take() { const ranges = this.ranges; this.ranges = []; return ranges; }
  restore(ranges: WatchedRange[]) { this.ranges = mergeWatched([...ranges, ...this.ranges]); }
}
