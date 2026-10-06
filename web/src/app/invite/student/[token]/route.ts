import { NextResponse, type NextRequest } from "next/server";
import { platformOrigin } from "../../../../lib/routing";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9._~-]{1,256}$/.test(token)) {
    return new Response("Invalid student invitation link.", { status: 400 });
  }

  if (request.headers.get("host")?.toLowerCase() !== new URL(platformOrigin("student")).host.toLowerCase()) {
    const canonical = NextResponse.redirect(`${platformOrigin("student")}/invite/student/${encodeURIComponent(token)}`, 303);
    canonical.headers.set("cache-control", "no-store");
    canonical.headers.set("referrer-policy", "no-referrer");
    return canonical;
  }
  const response = NextResponse.redirect(new URL("/onboarding/student", platformOrigin("student")));
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  response.cookies.set("edra_pending_student_invite", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
