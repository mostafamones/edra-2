import type { Metadata } from "next";

import { ResetPasswordForm } from "@/modules/auth/components/forms/reset-password";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
