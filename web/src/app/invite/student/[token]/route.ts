import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9._~-]{1,256}$/.test(token)) {
    return new Response("Invalid student invitation link.", { status: 400 });
  }

  const response = NextResponse.redirect(new URL("/onboarding/student", request.url));
  response.headers.set("cache-control", "no-store");
  response.cookies.set("edra_pending_student_invite", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
