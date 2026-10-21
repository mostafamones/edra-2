"use client";
import { useCanonicalHref } from "@/modules/navigation";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { IconAlertCircle as AlertCircle, IconArrowLeft as ArrowLeft } from "@tabler/icons-react";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import { AcademyGate, useAcademyScope, useAuth } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import { canImportStudents } from "../../permissions";
import { StudentRequestError } from "../../queries";
import { cancelStudentImport } from "../actions";
import { peekPendingImportFile } from "../handoff";
import { fetchImportSummary, importSummaryQueryKey } from "../queries";
import { importTitle, type ImportFormat, type ImportSummary } from "../types";
import { ProgressStep } from "./progress";
import { ReviewStep } from "./review";
import { SourceStep } from "./source-step";
import { useAcademyData, type AcademyData } from "./use-academy-data";

export function ImportStudentsPage() {
  // The gate re-mounts the flow per academy, which abandons a parse and any in-progress batches.
  return (
    <AcademyGate>
      {(academy) => (
        <Suspense fallback={<PageSkeleton />}>
          <ImportContent academy={academy} />
        </Suspense>
      )}
    </AcademyGate>
  );
}

type DraftInfo = { fileName: string; entries: number };

function ImportContent({ academy }: { academy: AcademyEntry }) {
  const href = useCanonicalHref();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const data = useAcademyData(academy.id);
  // The file chosen in the start dialog, kept in memory; a reload loses it.
  const [pending] = useState(() => peekPendingImportFile(academy.id));
  const [info, setInfo] = useState<DraftInfo | null>(null);
  const rawSession = searchParams.get("session");
  const sessionId = rawSession && z.guid().safeParse(rawSession).success ? rawSession : null;
  const overview = useQuery({ queryKey: importSummaryQueryKey(academy.id, sessionId ?? ""), queryFn: ({ signal }) => fetchImportSummary(academy.id, sessionId!, signal), enabled: Boolean(sessionId && canImportStudents(academy.role)) });

  const navigate = (next: { format: ImportFormat; session?: string | null }) => {
    const query = new URLSearchParams({ format: next.format });
    if (next.session) query.set("session", next.session);
    router.replace(`${pathname}?${query}`);
  };
  const toList = () => router.replace(href("/app/students"));
  // Without a chosen file or a saved session there is nothing to review: choosing a file happens in the list's dialog.
  const nothingToImport = !sessionId && !pending;
  useEffect(() => {
    if (nothingToImport) router.replace(href("/app/students"));
  }, [nothingToImport, router, href]);

  if (!canImportStudents(academy.role)) {
    return (
      <Shell info={null}>
        <Alert>
          <AlertCircle />
          <AlertTitle>Importing isn’t available</AlertTitle>
          <AlertDescription>Only owners, head admins and admins can import students.</AlertDescription>
        </Alert>
      </Shell>
    );
  }

  return (
    <Shell info={info} session={overview.data}>
      {sessionId ? (
        <SessionView
          key={sessionId}
          academy={academy}
          sessionId={sessionId}
          data={data}
          onStartOver={toList}
          onOpenSession={navigate}
        />
      ) : data.error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Couldn’t load the academy’s levels and groups</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Check your connection and try again.
            <Button variant="outline" size="sm" onClick={data.retry} disabled={data.retrying}>{data.retrying ? "Retrying…" : "Retry"}</Button>
          </AlertDescription>
        </Alert>
      ) : data.loading || !data.structure || !data.groups ? (
        pending ? null : <Skeleton className="h-64 w-full rounded-lg" />
      ) : !data.year ? (
        <Alert>
          <AlertCircle />
          <AlertTitle>No active academic year</AlertTitle>
          <AlertDescription>Students are imported into the open academic year. Open one for this academy before importing.</AlertDescription>
        </Alert>
      ) : pending ? (
        <SourceStep
          academy={academy}
          format={pending.format}
          year={data.year}
          initialFile={pending.file}
          onPrepared={(session) => navigate({ format: pending.format, session })}
          onInfo={setInfo}
        />
      ) : (
        <Skeleton className="h-64 w-full rounded-lg" />
      )}
    </Shell>
  );
}

function Shell({ info, session, children }: { info: DraftInfo | null; session?: ImportSummary; children: ReactNode }) {
  const href = useCanonicalHref();
  const title = session ? importTitle(session.importNumber) : "Review Import";
  useBreadcrumbTitle(title);
  return (
    <main className="page-shell min-w-0">
      <div className="flex flex-col gap-1">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" asChild>
          <Link href={href("/app/students")} ><ArrowLeft />Students</Link>
        </Button>
        <h1 className="font-heading text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {session ? `${session.fileName} · Imported by ${session.importedByName}` : info ? `${info.fileName} · ${info.entries.toLocaleString("en")} ${info.entries === 1 ? "entry" : "entries"}` : "\u00a0"}
        </p>
      </div>
      {children}
    </main>
  );
}

type SessionProps = {
  academy: AcademyEntry;
  sessionId: string;
  data: AcademyData;
  onStartOver: () => void;
  onOpenSession: (next: { format: ImportFormat; session: string }) => void;
};

/** Shows the step for a saved session: finishing an interrupted preparation, review, or progress and results. */
function SessionView({ academy, sessionId, data, onStartOver, onOpenSession }: SessionProps) {
  const isCurrentAcademy = useAcademyScope();
  const { user } = useAuth();
  const [autoStart, setAutoStart] = useState(false);
  const query = useQuery({
    queryKey: importSummaryQueryKey(academy.id, sessionId),
    queryFn: ({ signal }) => fetchImportSummary(academy.id, sessionId, signal),
    retry: (count, error) => !(error instanceof StudentRequestError && error.status === 404) && count < 2,
  });
  const summary = query.data;
  if (query.isError && !summary) {
    const missing = query.error instanceof StudentRequestError && query.error.status === 404;
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>{missing ? "Import not found" : "Couldn’t load the import"}</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          {missing ? "It doesn’t exist in this academy." : "Check your connection and try again."}
          {missing
            ? <Button variant="outline" size="sm" onClick={onStartOver}>Start a new import</Button>
            : <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>Retry</Button>}
        </AlertDescription>
      </Alert>
    );
  }
  if (!summary) return <Skeleton className="h-64 w-full rounded-lg" />;
  if (summary.state === "completed" || summary.state === "blocked" || summary.state === "importing") return <ProgressStep academyId={academy.id} summary={summary} autoStart={autoStart} />;

  if (summary.state === "cancelled") {
    return (
      <Alert>
        <AlertCircle />
        <AlertTitle>This import was discarded</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          No students were created by it.
          <Button size="sm" variant="outline" onClick={onStartOver}>Start a new import</Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (data.loading) return <Skeleton className="h-64 w-full rounded-lg" />;
  if (data.error) return <Alert variant="destructive"><AlertTitle>Couldn’t load the academy’s structure</AlertTitle><AlertDescription><Button variant="outline" size="sm" onClick={data.retry} disabled={data.retrying}>Retry</Button></AlertDescription></Alert>;
  if ((!data.year || summary.academicYearId !== data.year.id) && (summary.state === "staging" || summary.state === "reviewing")) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>This import belongs to a closed academic year</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          Nothing was imported from it. Start again to import into the current year.
          <Button size="sm" variant="outline" onClick={onStartOver}>Start a new import</Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (!data.year || !data.structure || !data.groups) return <Skeleton className="h-64 w-full rounded-lg" />;
  if (summary.state === "staging" && summary.createdBy !== user?.id) return <p className="text-sm text-muted-foreground">This draft was prepared by {summary.importedByName}.</p>;
  if (summary.state === "staging") {
    return (
      <div className="flex flex-col gap-5">
        <Alert>
          <AlertCircle />
          <AlertTitle>Preparing this file was interrupted</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span dir="auto">
              {summary.stagedRows.toLocaleString("en")} of {summary.expectedRows.toLocaleString("en")} rows of {summary.fileName} were received. No students were created.
              Select the same file below to finish, or start over.
            </span>
            <Button size="sm" variant="outline" onClick={async () => {
              const targetAcademyId = academy.id;
              await cancelStudentImport(summary.id);
              if (isCurrentAcademy(targetAcademyId)) onStartOver();
            }}>Start over</Button>
          </AlertDescription>
        </Alert>
        <SourceStep
          academy={academy}
          format={summary.format}
          year={data.year}
          resume={summary}
          // Finishing reuses this session; a changed mapping starts (and opens) a replacement.
          onPrepared={(next) => (next === summary.id ? void query.refetch() : onOpenSession({ format: summary.format, session: next }))}
        />
      </div>
    );
  }
  if (summary.state === "reviewing") {
    return (
      <ReviewStep
        academyId={academy.id}
        summary={summary}
        levels={data.structure.levels}
        tracks={data.structure.tracks}
        levelNames={data.structure.levelNames}
        groups={data.groups}
        onConfirmed={() => setAutoStart(true)}
        onDiscarded={onStartOver}
      />
    );
  }
  return <ProgressStep academyId={academy.id} summary={summary as ImportSummary} autoStart={autoStart} />;
}

function PageSkeleton() {
  return (
    <main role="status" aria-label="Loading import" className="page-shell">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </main>
  );
}
