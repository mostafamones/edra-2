import { useState } from "react";
import { HomeView } from "../src/modules/home/view";
import type { LiveSession } from "../src/modules/sessions/types";

const session: LiveSession = {
  id: "sample", academyId: "preview", academyName: "Coding Heaven", academySlug: "coding", academicYearId: "year",
  scheduleId: "schedule", scheduleTitle: "Second Secondary · مراجعة البرمجة", scheduleKind: "recurring", audience: "group",
  groupId: "group", groupName: "Scientific A", levelId: "secondary-2", levelName: "Second Secondary", trackId: "track", trackName: "Scientific",
  mandatory: true, location: "Main hall", state: "live", startedAt: "2026-10-29T14:00:00Z", startedBy: "teacher", startedByName: "Yassin Tamer",
  autoEndAt: "2026-10-29T16:00:00Z", metadataVersion: 1, rosterCount: 24,
};
export function HomeExample({ state }: { state: string }) {
  const [retried, setRetried] = useState(false);
  const query = <T,>(data: T) => ({ data: state === "loading" || (state === "error" && !retried) ? undefined : data, isPending: state === "loading", isFetching: state === "loading", error: state === "error" && !retried ? new Error("Check your connection and try again.") : null, refetch: async () => { setRetried(true); } });
  const data = {
    year: 2026, asOf: '2026-10-29T12:00:00Z', attentionCount: state === 'empty' ? 0 : 3,
    students: {total: 120, online: 32, levels: [{id:'secondary-2',name:'Second Secondary',total:76,online:24},{id:'preparatory-3',name:'Third Preparatory',total:44,online:8}]},
    attention: state === 'empty' ? [] : [{kind:'attendance' as const,id:'a',title:'Scientific A · Monday class',amount:1},{kind:'review' as const,id:'b',title:'C++ fundamentals · مراجعة البرمجة',amount:1},{kind:'assignment' as const,id:'c',title:'Loops and conditions',amount:6}],
    today: [{id:'s',title:'Scientific A',location:'Main hall',startsAt:'16:00:00',endsAt:'17:30:00'},{id:'s2',title:'Literature B',location:'Room 2',startsAt:'18:00:00',endsAt:'19:30:00'}],
  };
  return <HomeView academyName="Coding Heaven" base="/coding" live={query(state === "empty" ? [] : [session])} overview={query(data)} />;
}
