import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const RECOVERY_COOKIE = "edra_recovery_pending";

export async function POST() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(RECOVERY_COOKIE, "1", {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(RECOVERY_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/", sameSite: "lax" });
  return response;
}
