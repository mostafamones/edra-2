import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
const score = z.union([z.string(),z.number()]).transform(String);
const schema = z.object({total:z.number(),items:z.array(z.object({
  id:z.string(),title:z.string(),kind:z.enum(["assignment","quiz","exam"]),work:z.string().nullable(),
  complete:z.boolean(),score:score.nullable(),maximum:score.nullable(),publicationState:z.string().nullable(),
  publication:z.object({total:score,max_score:score.optional(),published_at:z.string()}).nullable(),
}))});
export async function loadStudentAssessments(academyId:string,recordId:string,offset:number,signal:AbortSignal) {
  const {data,error}=await createClient().rpc("staff_student_assessments",{p_academy_id:academyId,p_record_id:recordId,p_offset:offset}).abortSignal(signal);
  if(error) throw new Error("Couldn’t load student assessments. Try again.");
  return schema.parse(data);
}
