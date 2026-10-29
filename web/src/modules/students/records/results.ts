export type StudentResult = {
  id: string;
  title: string;
  kind: string;
  publication: { total: string; max_score?: string; published_at: string } | null;
};

/** Only announced snapshots of one assessment type can enter the chart. */
export function announcedResults(items: StudentResult[], kind: string) {
  return items.flatMap(item => {
    const result = item.publication;
    if (item.kind !== kind || !result) return [];
    const total = Number(result.total);
    const maximum = Number(result.max_score);
    const timestamp = Date.parse(result.published_at);
    if (!result.total.trim() || !Number.isFinite(total) || !Number.isFinite(maximum) || maximum <= 0 || !Number.isFinite(timestamp)) return [];
    return [{ id: item.id, title: item.title, at: result.published_at, timestamp, percent: total / maximum * 100, score: `${result.total} / ${result.max_score}` }];
  }).sort((a, b) => a.timestamp - b.timestamp).slice(-8);
}
