import { expect, it } from "vitest";
import { studentShortcuts } from "./student-shortcuts";
const students = Array.from({length:20},(_,i)=>({logicalId:`student-${i}`,displayName:`Student ${i}`,recordId:`record-${i}`,participationType:i===15?"online_only":"in_person"}));
it("offers two students including the online student",()=>{
  expect(studentShortcuts(students,null).map(student=>student.logicalId)).toEqual(["student-15","student-0"]);
});
it("keeps a currently selected student visible without listing everyone",()=>{
  expect(studentShortcuts(students,"student-8").map(student=>student.logicalId)).toEqual(["student-8","student-15"]);
});
