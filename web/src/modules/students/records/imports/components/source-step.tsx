"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { IconAdjustmentsHorizontal, IconAlertCircle, IconAlertTriangle, IconArrowRight, IconFileUpload } from "@tabler/icons-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAcademyScope } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import type { AcademicYear } from "@/modules/groups";
import { finalizeStudentImportPreview, removeStudentImportEntries, stageStudentImportRows, startStudentImport } from "../actions";
import { clearPendingImportFile, matchesFormat } from "../handoff";
import {
  buildStagedRows, chunkStagedRows, columnsFromHeader, emptyMapping, mappingProblems, suggestMapping, suggestHeaderIndex, unmappedColumns,
} from "../mapping";
import { parseInWorker } from "../parse";
import type { ColumnMapping, ImportDefaults, ImportFormat, ImportSession, ParsedSource } from "../types";
import { ACCEPT, FORMAT_LABELS } from "./formats";
import { MappingPanel } from "./mapping";
import { previewRow } from "../preview";
import { ImportPreviewTable } from "./preview-table";

const EMPTY_DEFAULTS: ImportDefaults = { levelId: "", trackId: "", primaryGroupId: "", participationType: "" };

type Props = {
  academy: AcademyEntry;
  format: ImportFormat;
  year: AcademicYear;
  /** A session whose staging was interrupted; preparing the same file again finishes it. */
  resume?: ImportSession;
  /** The file chosen in the start dialog; it is read as soon as this step opens. */
  initialFile?: File;
  onPrepared: (sessionId: string) => void;
  /** The file and entry count shown in the page header. */
  onInfo?: (info: { fileName: string; entries: number } | null) => void;
};

type Preparing = { phase: "starting" | "staging" | "validating"; staged: number; total: number };

const sameDefaults = (session: ImportSession, defaults: ImportDefaults) =>
  (session.defaults.level_id ?? "") === defaults.levelId
  && (session.defaults.track_id ?? "") === defaults.trackId
  && (session.defaults.primary_group_id ?? "") === defaults.primaryGroupId
  && (session.defaults.participation_type ?? "") === defaults.participationType;

/** Choose a file, map its columns, choose defaults, and stage it for a validated preview. */
export function SourceStep({
  academy, format, year, resume, initialFile, onPrepared, onInfo,
}: Props) {
  const isCurrentAcademy = useAcademyScope();
  const inputRef = useRef<HTMLInputElement>(null);
  const parseController = useRef<AbortController | null>(null);
  // The unconfirmed session this draft created; a changed mapping replaces (and cancels) it.
  const draftSession = useRef<string | null>(resume?.id ?? null);
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [parsing, setParsing] = useState(Boolean(initialFile));
  const [error, setError] = useState("");
  const [source, setSource] = useState<ParsedSource | null>(null);
  const [headerIndex, setHeaderIndex] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>(emptyMapping);
  const [defaults] = useState<ImportDefaults>(() => resume ? {
    levelId: resume.defaults.level_id ?? "",
    trackId: resume.defaults.track_id ?? "",
    primaryGroupId: resume.defaults.primary_group_id ?? "",
    participationType: (resume.defaults.participation_type ?? "") as ImportDefaults["participationType"],
  } : EMPTY_DEFAULTS);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [removed, setRemoved] = useState(new Set<number>());
  const [preparing, setPreparing] = useState<Preparing | null>(null);
  const [savedReview, setSavedReview] = useState<string | null>(null);

  // A parse in flight is abandoned when the file, format, or academy changes (all of which unmount or reset).
  useEffect(() => () => parseController.current?.abort(), []);
  useEffect(() => {
    if (!preparing) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [preparing]);

  const columns = useMemo(() => (source ? columnsFromHeader(source, headerIndex) : []), [source, headerIndex]);
  const problems = mappingProblems(mapping, defaults);

  const parse = useCallback(async (next: File, sheet: string | null) => {
    parseController.current?.abort();
    const controller = new AbortController();
    parseController.current = controller;
    setParsing(true);
    setError("");
    const result = await parseInWorker(next, format, sheet, controller.signal);
    if (controller.signal.aborted || !result) return;
    setParsing(false);
    if (!result.ok) {
      setSource(null);
      setError(result.error.message);
      return;
    }
    setSource(result.source);
    const header = suggestHeaderIndex(result.source);
    setHeaderIndex(header);
    setMapping(suggestMapping(columnsFromHeader(result.source, header)));
    setRemoved(new Set());
    setSavedReview(null);
  }, [format]);

  // Defer the worker launch so Strict Mode's setup/cleanup replay can cancel the first setup.
  useEffect(() => {
    if (!initialFile) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void parse(initialFile, null);
    });
    return () => {
      cancelled = true;
      parseController.current?.abort();
    };
  }, [initialFile, parse]);

  function choose(next: File | undefined) {
    if (!next) return;
    if (!matchesFormat(next, format)) {
      setError(`Choose a .${format} file, or switch the format above.`);
      return;
    }
    setFile(next);
    setSource(null);
    void parse(next, null);
  }

  const prepare = useCallback(async () => {
    if (!source || !file) return;
    if (problems.length > 0) { setMappingOpen(true); return; }
    const built = buildStagedRows(source, headerIndex, mapping);
    if (!built.ok) { setError(built.message); return; }
    const targetAcademyId = academy.id;
    const chunks = chunkStagedRows(built.rows);
    setError("");
    setPreparing({ phase: "starting", staged: 0, total: built.rows.length });
    try {
      const reuse = resume && draftSession.current === resume.id && resume.fileName === file.name && resume.format === format
        && resume.worksheet === source.sheet && resume.expectedRows === built.rows.length && sameDefaults(resume, defaults);
      let sessionId = reuse ? resume.id : null;
      if (!sessionId) {
        const started = await startStudentImport(
          { academyId: targetAcademyId, academicYearId: year.id },
          { fileName: file.name, format, worksheet: source.sheet, defaults, replaces: draftSession.current },
          built.rows.length,
        );
        if (!isCurrentAcademy(targetAcademyId)) return;
        if (!started.ok) { setError(started.message); return; }
        sessionId = started.data.sessionId;
        draftSession.current = sessionId;
      }
      let staged = 0;
      for (const chunk of chunks) {
        setPreparing({ phase: "staging", staged, total: built.rows.length });
        let result = await stageStudentImportRows(sessionId, chunk);
        // A lost response is safe to retry: identical rows are accepted again.
        for (let attempt = 0; !result.ok && result.code === "unavailable" && attempt < 2; attempt++) {
          result = await stageStudentImportRows(sessionId, chunk);
        }
        if (!isCurrentAcademy(targetAcademyId)) return;
        if (!result.ok) {
          setError(result.code === "stage_conflict"
            ? "This file differs from the one this import started with. Change a column or default to start a new import with it."
            : result.message);
          return;
        }
        staged += chunk.length;
      }
      setPreparing({ phase: "validating", staged, total: built.rows.length });
      const finalized = await finalizeStudentImportPreview(sessionId);
      if (!isCurrentAcademy(targetAcademyId)) return;
      if (!finalized.ok) { setError(finalized.message); return; }
      setSavedReview(sessionId);
      if (removed.size > 0) {
        const result = await removeStudentImportEntries(sessionId, finalized.data.revision, [...removed]);
        if (!isCurrentAcademy(targetAcademyId)) return;
        if (!result.ok) { setError(result.message); return; }
      }
      clearPendingImportFile();
      onPrepared(sessionId);
    } catch {
      if (isCurrentAcademy(targetAcademyId)) setError("Couldn’t prepare the preview. Check your connection and try again.");
    } finally {
      if (isCurrentAcademy(targetAcademyId)) setPreparing(null);
    }
  }, [source, file, problems.length, headerIndex, mapping, academy.id, resume, defaults, removed, isCurrentAcademy, onPrepared, format, year.id]);

  const autoPrepared = useRef<ParsedSource | null>(null);
  useEffect(() => {
    if (!source || resume || mappingOpen || autoPrepared.current === source) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || problems.length || unmappedColumns(columns, mapping).length) return;
      autoPrepared.current = source;
      void prepare();
    });
    return () => { cancelled = true; };
  }, [source, resume, prepare, problems.length, columns, mapping, mappingOpen]);

  const built = useMemo(() => source ? buildStagedRows(source, headerIndex, mapping) : null, [source, headerIndex, mapping]);
  const busy = parsing || Boolean(preparing);
  const entryCount = source && built?.ok ? built.rows.length - removed.size : null;
  const fileName = file?.name ?? resume?.fileName;
  useEffect(() => { onInfo?.(fileName && entryCount !== null ? { fileName, entries: entryCount } : null); }, [onInfo, fileName, entryCount]);
  useEffect(() => () => onInfo?.(null), [onInfo]);
  const rows = built?.ok ? built.rows.filter((row) => !removed.has(row.ordinal)).map(previewRow) : [];
  const unmatched = unmappedColumns(columns, mapping);
  const warnings = unmatched.length + problems.length;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <input ref={inputRef} type="file" aria-label="Student import file" accept={ACCEPT[format]} className="sr-only" tabIndex={-1} disabled={busy} onChange={(event) => { choose(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
      {!file && <Button variant="outline" className="w-fit" onClick={() => inputRef.current?.click()}><IconFileUpload />Choose the {FORMAT_LABELS[format]} file</Button>}
      {parsing ? <div role="status" aria-label="Reading file"><Skeleton className="h-80 w-full rounded-lg" /></div> : source && <ImportPreviewTable rows={rows} onRemove={(ordinals) => setRemoved((current) => new Set([...current, ...ordinals]))} disabled={busy} actions={<>
        <Button variant="outline" size="sm" disabled={busy || !source} onClick={() => setMappingOpen(true)}>
          {warnings ? <IconAlertTriangle className="text-amber-500" /> : <IconAdjustmentsHorizontal />}
          {warnings ? `${warnings} mapping ${warnings === 1 ? "warning" : "warnings"}` : "Columns matched"}
        </Button>
        <Button size="sm" disabled={busy || !rows.length} onClick={() => savedReview ? onPrepared(savedReview) : void prepare()}>{preparing ? "Checking entries…" : savedReview ? "Open saved review" : <>Next<IconArrowRight /></>}</Button>
      </>} />}
      {(error || (built && !built.ok)) && <Alert variant="destructive"><IconAlertCircle /><AlertTitle>Couldn’t prepare the import</AlertTitle><AlertDescription>{error || (built && !built.ok ? built.message : "")}</AlertDescription></Alert>}
      <Sheet open={mappingOpen} onOpenChange={setMappingOpen}>
        <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
          <SheetHeader><SheetTitle>Column mapping</SheetTitle><SheetDescription>Choose the column each field is read from.</SheetDescription></SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            {unmatched.length > 0 && <p className="mb-5 text-sm text-amber-600 dark:text-amber-400" dir="auto">Unmapped columns: {unmatched.map((column) => column.label).join(", ")}. These columns will be ignored.</p>}
            {source && <MappingPanel source={source} headerIndex={headerIndex} onHeaderChange={(index) => { setHeaderIndex(index); setRemoved(new Set()); setMapping(suggestMapping(columnsFromHeader(source, index))); }} onSheetChange={(sheet) => { if (file) void parse(file, sheet); }} columns={columns} mapping={mapping} onMappingChange={setMapping} problems={problems} showProblems={true} disabled={busy} />}
          </div>
          <SheetFooter>
            <Button disabled={busy} onClick={() => setMappingOpen(false)}>Done</Button>
            <Button variant="outline" disabled={busy} onClick={() => { setMappingOpen(false); inputRef.current?.click(); }}>Choose another file</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

