import { createFileRoute } from "@tanstack/react-router";

import { SessionEnded } from "@/modules/auth/components/session-ended";

export const Route = createFileRoute("/auth/session-ended")({ head: () => ({ meta: [{ title: "Session ended · Edra" }] }), component: SessionEnded });
