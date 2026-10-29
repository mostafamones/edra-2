import { expect, it } from "vitest";
import { attendanceInsights } from "./insights";
const rows = (statuses: string[]) => statuses.map((status,i) => ({session_id:String(i),session_started_at:new Date(Date.UTC(2026,9,29-i)).toISOString(),mandatory:true,status}));
it("compares equal sized chronological groups with evidence rather than making predictions", () => {
  const insights = attendanceInsights(rows(["absent","absent","present","late","present",...Array(5).fill("present")]).reverse());
  expect(insights[0].title).toBe("Absent in 2 of the last 5 finalized mandatory sessions");
  expect(insights[1].title).toContain("3 of the latest 5 sessions, compared with 5");
  expect(insights[1].evidence).toHaveLength(10);
});
it("does not treat unknown/excused as absence or imply a trend from sparse or optional records", () => {
  expect(attendanceInsights(rows(["absent","present"]))).toEqual([]);
  expect(attendanceInsights(rows(Array(10).fill("absent")).map(row => ({...row,mandatory:false})))).toEqual([]);
  expect(attendanceInsights(rows(["unknown","excused",...Array(8).fill("present")]))).toEqual([]);
});
