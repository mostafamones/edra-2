// Pure workspace rules for the chrome prototype. No React Native imports: tested with `node --test`.
import type { Student } from "../../fixtures/index.ts";

export const filters = ["All", "Not received", "Needs marking", "Marked", "Unannounced"] as const;
export type Filter = (typeof filters)[number];

/** Which workspace panes exist. Scan leaves while selecting; its removal must not drop other panes' state. */
export function workspacePanes(access: { canMark: boolean; codesEnabled: boolean }, selecting: boolean, searchTabs: boolean) {
  return {
    scan: access.canMark && access.codesEnabled && !selecting,
    /** iOS 26.1+ search tab; it becomes the "Announce selected" action while selecting. */
    searchTab: searchTabs,
    /** Without a search tab, selecting shows an Announce button in the navigation bar instead. */
    toolbarAnnounce: selecting && !searchTabs,
  };
}

/** Fixture stand-in for the server's eligibility: only complete, saved, unannounced work. */
export const announceable = (s: Student) => s.status === "Marked";

export function visibleStudents(all: Student[], filter: Filter, search: string) {
  const q = search.trim().toLowerCase();
  return all.filter(
    (s) =>
      (filter === "All" ||
        (filter === "Unannounced" ? s.status === "Marked" : filter === "Needs marking" ? s.status === "Received" : s.status === filter)) &&
      (!q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)),
  );
}
