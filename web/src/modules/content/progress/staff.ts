import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { accessSchema } from "../access/types";
import { unitProgressSchema } from "./types";
const schema = z.object({ total:z.number(), started:z.number(), completed:z.number(), units:z.array(z.object({id:z.string(),title:z.string(),access:accessSchema,progress:unitProgressSchema})) });
export async function loadStaffStudentLearning(academyId:string,recordId:string,offset:number,signal:AbortSignal) {
  const {data,error} = await createClient().rpc("staff_student_learning",{p_academy_id:academyId,p_record_id:recordId,p_offset:offset}).abortSignal(signal);
  if(error) throw new Error("Couldn’t load student learning. Try again.");
  return schema.parse(data);
}
