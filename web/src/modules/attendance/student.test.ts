import { expect, it } from "vitest";
import { studentAttendanceSummary } from "./student";
const rows = (...statuses: string[]) => statuses.map((status, index) => ({session_id:String(index),session_started_at:"2026-10-29T12:00:00Z",status,mandatory:true}));
it("counts late positively and excludes excused, unknown and optional attendance from the denominator", () => {
  const summary = studentAttendanceSummary([...rows("present","late","absent","excused","unknown"), {...rows("absent")[0],mandatory:false}]);
  expect(summary.rate).toBeCloseTo(200/3);
  expect(summary.excused).toBe(1);
  expect(summary.unknown).toBe(1);
});
it("does not turn no qualifying records into a zero percent attendance rate", () => {
  expect(studentAttendanceSummary([]).rate).toBeNull();
  expect(studentAttendanceSummary(rows("excused","unknown")).rate).toBeNull();
  expect(studentAttendanceSummary(rows("absent")).rate).toBe(0);
});
