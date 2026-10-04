"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, FileUp, History } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { clearPendingImportFile, matchesFormat, setPendingImportFile } from "../handoff";
import { IMPORT_LIMITS } from "../limits";
import { fetchUnfinishedImport, unfinishedImportQueryKey } from "../queries";
import { isImportFormat, type ImportFormat } from "../types";
import { ImportInstructions } from "./instructions";
import { ACCEPT, FORMAT_LABELS } from "./formats";
import { useAcademyData } from "./use-academy-data";

type Props = {
  academyId: string;
  /** The format chosen from the Import menu; null closes the dialog. */
  format: ImportFormat | null;
  onFormatChange: (format: ImportFormat) => void;
  onClose: () => void;
};

/** Starts an import: pick the format, read the template notes, and choose a file, which opens the review page. */
export function ImportDialog({ academyId, format, onFormatChange, onClose }: Props) {
  return (
    <Dialog open={format !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        {format && <DialogBody academyId={academyId} format={format} onFormatChange={onFormatChange} />}
      </DialogContent>
    </Dialog>
  );
}

function DialogBody({ academyId, format, onFormatChange }: { academyId: string; format: ImportFormat; onFormatChange: (format: ImportFormat) => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const data = useAcademyData(academyId);
  const unfinished = useQuery({ queryKey: unfinishedImportQueryKey(academyId), queryFn: ({ signal }) => fetchUnfinishedImport(academyId, signal) });
  const session = unfinished.data?.session;

  function choose(file: File | undefined) {
    if (!file) return;
    if (!matchesFormat(file, format)) {
      setError(`Choose a .${format} file, or switch the format above.`);
      return;
    }
    if (file.size > IMPORT_LIMITS.fileBytes) {
      setError(`This file is larger than ${IMPORT_LIMITS.fileBytes / 1024 / 1024} MiB.`);
      return;
    }
    setPendingImportFile({ academyId, file, format });
    router.push(`/app/students/import?format=${format}`);
  }

  function drop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (event.dataTransfer.files.length !== 1) {
      setError("Upload one file at a time.");
      return;
    }
    choose(event.dataTransfer.files[0]);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Import students</DialogTitle>
        <DialogDescription className="sr-only">
          Upload a file to review your students before importing.
        </DialogDescription>
      </DialogHeader>

      {session && (
        <Alert>
          <History />
          <AlertTitle>Continue unfinished import</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span dir="auto">{session.fileName} ({FORMAT_LABELS[session.format]}) is {session.state === "importing" ? "partly imported" : session.state === "reviewing" ? "ready to review" : "partly prepared"}.</span>
            <Button size="sm" variant="outline" onClick={() => { clearPendingImportFile(); router.push(`/app/students/import?format=${session.format}&session=${session.id}`); }}>Continue</Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-4">
        <Field orientation="horizontal" className="gap-3">
          <FieldLabel htmlFor="import-format">Format</FieldLabel>
          <Select value={format} onValueChange={(next) => { if (isImportFormat(next)) { setError(""); onFormatChange(next); } }}>
            <SelectTrigger id="import-format" className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(FORMAT_LABELS) as ImportFormat[]).map((value) => (
                <SelectItem key={value} value={value}>{FORMAT_LABELS[value]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <input
          ref={inputRef}
          id="import-file"
          type="file"
          accept={ACCEPT[format]}
          className="sr-only"
          tabIndex={-1}
          aria-label="Student import file"
          onChange={(event) => { choose(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }}
        />
        <Button
          type="button"
          variant="outline"
          className={`h-auto min-h-52 w-full flex-col gap-3 rounded-xl border-dashed bg-transparent px-6 py-8 shadow-none whitespace-normal hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent ${dragging ? "border-primary text-primary" : ""}`}
          aria-label={`Upload ${FORMAT_LABELS[format]} file`}
          aria-describedby="import-file-limits"
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!event.dataTransfer.types.includes("Files")) return;
            dragDepth.current += 1;
            setDragging(true);
          }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
          onDragLeave={(event) => {
            event.preventDefault();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDragging(false);
          }}
          onDrop={drop}
        >
          <FileUp className="size-8 text-muted-foreground" aria-hidden="true" />
          <span className="text-center text-base">{dragging ? "Drop your file here" : "Drag and drop your file here"}</span>
          <span id="import-file-limits" className="text-xs font-normal text-muted-foreground">
            .{format} · {IMPORT_LIMITS.fileBytes / 1024 / 1024} MiB max · {IMPORT_LIMITS.rows.toLocaleString("en")} students
          </span>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Couldn’t use this file</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ImportInstructions format={format} reference={data.reference} />
    </>
  );
}
