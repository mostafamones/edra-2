import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/modules/auth/components/forms/forgot-password";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
