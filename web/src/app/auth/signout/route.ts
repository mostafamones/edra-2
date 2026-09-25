import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) await supabase.auth.signOut({ scope: "global" });
  revalidatePath("/", "layout");
  const response = NextResponse.redirect(new URL("/auth/login", request.url), 303);
  response.cookies.set("edra_recovery_pending", "", { httpOnly: true, maxAge: 0, path: "/", sameSite: "lax" });
  response.cookies.set("edra_pending_student_invite", "", { httpOnly: true, maxAge: 0, path: "/", sameSite: "lax" });
  return response;
}
