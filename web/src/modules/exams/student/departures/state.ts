export type DepartureContext = { eventId: string; questionId: string | null; generation: number };
export type Episode = { event: DepartureContext; acknowledged: boolean };
/** No time debounce: only an acknowledged warning and actual visible fullscreen resumption rearm. */
export class DepartureEpisodes {
  episode: Episode | null = null;
  finished = false;
  signal(create: () => DepartureContext) {
    if (this.finished) return null;
    this.episode ??= { event: create(), acknowledged: false };
    return this.episode.event;
  }
  acknowledge(eventId: string) {
    if (this.episode?.event.eventId === eventId) this.episode.acknowledged = true;
  }
  continue(ready: boolean) {
    if (this.finished || !ready || !this.episode?.acknowledged) return false;
    this.episode = null;
    return true;
  }
  finish() { this.finished = true; this.episode = null; }
}
