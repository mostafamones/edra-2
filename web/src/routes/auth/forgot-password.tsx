import { createFileRoute } from "@tanstack/react-router";

import { ForgotPasswordForm } from "@/modules/auth/components/forms/forgot-password";

export const Route = createFileRoute("/auth/forgot-password")({ head: () => ({ meta: [{ title: "Forgot password · Edra" }] }), component: ForgotPasswordForm });
