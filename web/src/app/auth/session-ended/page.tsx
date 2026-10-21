import type { Metadata } from "next";

import { SessionEnded } from "@/modules/auth/components/session-ended";

export const metadata: Metadata = { title: "Session ended" };

export default function SessionEndedPage() {
  return <SessionEnded />;
}
