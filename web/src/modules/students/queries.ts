import { createClient } from "@/lib/supabase/server";

export async function getStudentProfile(userId: string) {
  const supabase = await createClient();
  return supabase
    .from("student_profiles")
    .select("user_id, level_id, parent_phone, parent_phone_verified_at")
    .eq("user_id", userId)
    .maybeSingle();
}
