"use client";

import { StudentExamsError } from "@/modules/exams";

export default function ExamsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <StudentExamsError retry={retry} />;
}
