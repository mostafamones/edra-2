"use client";

import { useRef, useState } from "react";
import { IconFileUpload, IconRefresh, IconTrash } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { newUuid } from "@/lib/uuid";

import { finishAssignmentUpload, readAssignmentEditor, removeAssignmentFile, startAssignmentUpload } from "../actions";
import { WORK_FILE_ACCEPT, WORK_FILE_MAX_COUNT, workFileMime, workFileProblem, type WorkFileType } from "../files";
import type { EditorDocument, EditorPart, StudentAssignmentFailure } from "../types";
import { uploadToSignedUrl } from "../upload";

type Editor = () => { academyId: string; assignmentId: string; token: string };
type Props = {
  part: EditorPart; doc: EditorDocument; editor: Editor;
  onDocument: (doc: EditorDocument) => void; onUploading: (delta: 1 | -1) => void; onFailure: (failure: StudentAssignmentFailure) => void;
};
type Local = { id: string; file: File; mime: WorkFileType; progress: number; error: string | null };

const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * One Written Work part: up to 20 PDFs or photos for the whole part. Only files the server has
 * accepted count; a selected file that has not finished uploading must be retried or removed.
 */
export function StudentAssignmentWrittenWork({ part, doc, editor, onDocument, onUploading, onFailure }: Props) {
  const [locals, setLocals] = useState<Local[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const files = doc.files.filter((file) => file.partId === part.id);
  const used = files.length + locals.filter((entry) => !entry.error).length;

  const update = (id: string, change: Partial<Local>) => setLocals((current) => current.map((entry) => entry.id === id ? { ...entry, ...change } : entry));

  async function upload(entry: Local) {
    onUploading(1);
    update(entry.id, { progress: 0, error: null });
    try {
      const generation = doc.generation;
      const started = await startAssignmentUpload({
        ...editor(), operation: "register", generation, key: newUuid(), partId: part.id,
        name: entry.file.name.slice(0, 250) || "Upload", mime: entry.mime, size: entry.file.size,
      });
      if (!started.ok) { onFailure(started); update(entry.id, { error: started.message }); return; }
      const sent = await uploadToSignedUrl(started.data.url, entry.file, entry.mime, (progress) => update(entry.id, { progress }));
      if (!sent) {
        await removeAssignmentFile({ ...editor(), operation: "remove", generation, key: newUuid(), fileId: started.data.fileId });
        update(entry.id, { error: "Upload failed. Check your connection and retry." });
        return;
      }
      const finished = await finishAssignmentUpload({ ...editor(), operation: "finish", generation, key: newUuid(), fileId: started.data.fileId });
      if (!finished.ok) {
        onFailure(finished);
        update(entry.id, { error: finished.message });
        const read = await readAssignmentEditor({ ...editor(), operation: "read" });
        if (read.ok) onDocument(read.data);
        return;
      }
      onDocument(finished.data);
      setLocals((current) => current.filter((item) => item.id !== entry.id));
    } finally {
      onUploading(-1);
    }
  }

  function choose(list: FileList | null) {
    setError(null);
    const chosen = [...(list ?? [])];
    if (input.current) input.current.value = "";
    if (used + chosen.length > WORK_FILE_MAX_COUNT) { setError(`Each Written Work part accepts up to ${WORK_FILE_MAX_COUNT} files.`); return; }
    for (const file of chosen) {
      const problem = workFileProblem(file);
      if (problem) { setError(`${file.name}: ${problem}`); return; }
    }
    const entries = chosen.flatMap((file) => { const mime = workFileMime(file); return mime ? [{ id: newUuid(), file, mime, progress: 0, error: null }] : []; });
    setLocals((current) => [...current, ...entries]);
    for (const entry of entries) void upload(entry);
  }

  async function remove(fileId: string) {
    setRemoving(fileId);
    const result = await removeAssignmentFile({ ...editor(), operation: "remove", generation: doc.generation, key: newUuid(), fileId });
    if (!result.ok) { onFailure(result); setError(result.message); }
    const read = await readAssignmentEditor({ ...editor(), operation: "read" });
    if (read.ok) onDocument(read.data);
    setRemoving(null);
  }

  return (
    <section aria-labelledby={`part-${part.id}`} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={`part-${part.id}`} className="text-lg font-semibold">{part.title}</h2>
        {part.instructions && <p className="whitespace-pre-wrap text-sm">{part.instructions}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input ref={input} type="file" multiple accept={WORK_FILE_ACCEPT} className="sr-only" id={`upload-${part.id}`} onChange={(event) => choose(event.target.files)} />
        <Button type="button" variant="outline" disabled={used >= WORK_FILE_MAX_COUNT} onClick={() => input.current?.click()}>
          <IconFileUpload aria-hidden="true" />Add files
        </Button>
        <span className="text-sm text-muted-foreground">{used} of {WORK_FILE_MAX_COUNT} · PDF, JPEG, PNG, WebP or HEIC · up to 8 MB each</span>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <ul className="flex flex-col gap-2">
        {files.map((file) => (
          <li key={file.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <span className="text-sm text-muted-foreground">{file.state === "complete" ? size(file.size) : "Upload didn’t finish"}</span>
            <Button type="button" variant="ghost" size="sm" disabled={removing === file.id} onClick={() => void remove(file.id)}>
              <IconTrash aria-hidden="true" />Remove
            </Button>
          </li>
        ))}
        {locals.map((entry) => (
          <li key={entry.id} className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="min-w-0 flex-1 truncate">{entry.file.name}</span>
              {entry.error ? (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={() => void upload(entry)}><IconRefresh aria-hidden="true" />Retry</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setLocals((current) => current.filter((item) => item.id !== entry.id))}>
                    <IconTrash aria-hidden="true" />Remove
                  </Button>
                </>
              ) : <span className="text-sm text-muted-foreground" role="status">Uploading {Math.round(entry.progress * 100)}%</span>}
            </div>
            {entry.error ? <p role="alert" className="text-sm text-destructive">{entry.error}</p> : <Progress value={entry.progress * 100} aria-label={`Uploading ${entry.file.name}`} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
