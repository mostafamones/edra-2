import { createFileRoute } from "@tanstack/react-router";

import { ResetPasswordForm } from "@/modules/auth/components/forms/reset-password";

export const Route = createFileRoute("/auth/reset-password")({ head: () => ({ meta: [{ title: "Reset password · Edra" }] }), component: ResetPasswordForm });
