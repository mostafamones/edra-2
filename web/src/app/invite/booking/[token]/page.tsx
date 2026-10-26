import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { platformOrigin, studentBookingHref } from "@/lib/routing";
import { StudentBookingForm } from "@/modules/students";
import { getStudentBookingForm, previewStudentBookingEntry } from "@/modules/students/server";

export const metadata: Metadata = { title: "Register", referrer: "no-referrer", robots: { index: false } };

// Signed-in students whose verified identity already relates to the academy continue through onboarding.
const ONBOARDING_STATES = ["connected", "existing", "enroll", "staff_help", "level_unavailable", "closed", "changed"];

/** The public booking form. Rendering only reads; registration happens on explicit submit. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if ((await headers()).get("host")?.toLowerCase() !== new URL(platformOrigin("student")).host.toLowerCase()) {
    redirect(studentBookingHref(token));
  }
  const entry = await previewStudentBookingEntry(token);
  if (ONBOARDING_STATES.includes(entry.kind)) redirect(studentBookingHref(token, "/join"));
  const form = await getStudentBookingForm(token);
  return (
    <StudentBookingForm
      token={token}
      form={form}
      prefill={entry.kind === "form" ? entry.prefill : null}
      signInHref={entry.kind === "unauthenticated" ? studentBookingHref(token, "/join") : null}
    />
  );
}
