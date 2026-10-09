import { NextResponse } from "next/server";

import { getAuthErrorMessage } from "@/modules/auth/errors";
import { RECOVERY_COOKIE, RECOVERY_COOKIE_PATH, RECOVERY_WINDOW_SECONDS, encodeRecoveryTokens, verifyRecoveryCode } from "@/modules/auth/recovery";
import { verificationSchema } from "@/modules/auth/validation";

export async function POST(request: Request) {
  const body = verificationSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });

  const result = await verifyRecoveryCode(body.data);
  if (!result.ok) return NextResponse.json({ error: getAuthErrorMessage(new Error(result.message)) }, { status: 400 });

  const response = NextResponse.json({ ok: true });
  response.headers.set("cache-control", "private, no-store");
  response.cookies.set(RECOVERY_COOKIE, encodeRecoveryTokens(result.tokens), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: RECOVERY_COOKIE_PATH,
    maxAge: RECOVERY_WINDOW_SECONDS,
  });
  return response;
}
