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

/** Labels for an expanded staff progress row, from the published snapshot, never the draft.
 * Both reads retain the existing staff RLS and academy boundary. No media URLs are loaded.
 */
export async function loadStaffUnitMaterials(academyId: string, unitId: string, signal: AbortSignal) {
  z.guid().parse(academyId); z.guid().parse(unitId);
  const db = createClient();
  const unit = await db.from("content_units").select("published_revision").eq("academy_id", academyId).eq("id", unitId).abortSignal(signal).single();
  if (unit.error || !unit.data?.published_revision) throw new Error("Published materials are unavailable. Refresh and try again.");
  const revision = await db.from("content_revisions").select("document").eq("academy_id", academyId).eq("unit_id", unitId).eq("revision", unit.data.published_revision).abortSignal(signal).single();
  if (revision.error) throw new Error("Couldn’t load published materials. Try again.");
  return z.object({ items: z.array(z.object({ id: z.guid(), title: z.string(), kind: z.enum(["explanation", "document", "assessment", "answer"]) })) }).parse(revision.data.document).items;
}
