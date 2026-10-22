"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconExternalLink } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { formatAcademyDateTime } from "@/lib/academy-time";
import { PREVIEWABLE_TYPES } from "../../student/files";
import { loadReceivedFiles, openAssignmentReceivedFile } from "../../actions";
import type { Assignment } from "../../types";

/** Accepted online Written Work files for one student. Drafts never appear here. */
export function ReceivedFiles({ assignment, recordId }: { assignment: Assignment; recordId: string }) {
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["assignments", assignment.academyId, assignment.id, "received-files", recordId],
    queryFn: async () => {
      const result = await loadReceivedFiles({ academyId: assignment.academyId, assignmentId: assignment.id, recordId });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
  });
  if (!query.data?.submittedAt) return null;
  const parts = new Map(assignment.parts.map((part) => [part.id, part.title]));

  async function open(fileId: string) {
    setError(null);
    const target = window.open("", "_blank");
    const result = await openAssignmentReceivedFile({ academyId: assignment.academyId, fileId });
    if (!result.ok) { target?.close(); setError(result.message); return; }
    if (target) { target.opener = null; target.location.href = result.url; } else window.location.assign(result.url);
  }

  return (
    <section aria-label="Submitted online" className="flex flex-col gap-2 rounded-md border p-3 text-sm">
      <p className="font-medium">Submitted online <time dateTime={query.data.submittedAt}>{formatAcademyDateTime(query.data.submittedAt)}</time></p>
      {query.data.files.length > 0 && (
        <ul className="flex flex-col gap-1">
          {query.data.files.map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">{parts.get(file.partId)} · {file.name}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void open(file.id)}><IconExternalLink aria-hidden="true" />{PREVIEWABLE_TYPES.includes(file.mime) ? "Open" : "Download"}</Button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </section>
  );
}
