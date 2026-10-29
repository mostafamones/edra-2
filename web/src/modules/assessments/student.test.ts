import {expect,it,vi,afterEach} from "vitest";
const rpc=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/supabase/client",()=>({createClient:()=>({rpc})}));
import {loadStudentAssessments} from "./student";
afterEach(()=>vi.clearAllMocks());
it("keeps a recorded zero distinct from unmarked work and retains the announced snapshot",async()=>{
  const row={id:"a",title:"Quiz",kind:"quiz",work:"submitted",complete:false,score:null,maximum:"10",publicationState:"unpublished",publication:null};
  rpc.mockReturnValue({abortSignal:()=>Promise.resolve({data:{total:2,items:[row,{...row,id:"b",score:0,complete:true,publicationState:"pending_correction",publication:{total:"5",max_score:"10",published_at:"2026-10-29T12:00:00Z"}}]},error:null})});
  const data=await loadStudentAssessments("academy","record",0,new AbortController().signal);
  expect(data.items[0].score).toBeNull();
  expect(data.items[1].score).toBe("0");
  expect(data.items[1].publication?.total).toBe("5");
  expect(rpc).toHaveBeenCalledWith("staff_student_assessments",{p_academy_id:"academy",p_record_id:"record",p_offset:0});
});
it("does not turn denied assessment access into a successful empty history",async()=>{
  rpc.mockReturnValue({abortSignal:()=>Promise.resolve({data:null,error:{message:"forbidden"}})});
  await expect(loadStudentAssessments("academy","record",0,new AbortController().signal)).rejects.toThrow();
});
