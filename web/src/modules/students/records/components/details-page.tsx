"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import { HeaderActions } from "@/components/shared/header-actions";
import { AcademyGate } from "@/modules/auth";
import { useCanonicalHref } from "@/modules/navigation";
import { loadStructure, structureQueryKey, loadGroups, groupListQueryKey } from "@/modules/groups";
import type { AcademyEntry } from "@/modules/academies";
import { fetchStudentRecord, studentRecordQueryKey, StudentRequestError } from "../queries";
import { formatPhone, PARTICIPATION_LABELS } from "../validation";
import { StudentEditSheet } from "./edit-sheet";
import { StudentAttendance } from "./attendance";
import { StudentLearning } from "./learning";
import { StudentAssessments } from "./assessments";

export function StudentDetailsPage({ recordId, returnQuery = "" }: { recordId: string; returnQuery?: string }) {
  return <AcademyGate>{academy => <Details key={`${academy.id}:${recordId}`} academy={academy} recordId={recordId} returnQuery={returnQuery} />}</AcademyGate>;
}

function Details({ academy, recordId, returnQuery }: { academy: AcademyEntry; recordId: string; returnQuery: string }) {
  const href = useCanonicalHref();
  const [editing, setEditing] = useState(false);
  const [informationOpen, setInformationOpen] = useState(false);
  const record = useQuery({ queryKey: studentRecordQueryKey(academy.id, recordId), queryFn: ({ signal }) => fetchStudentRecord(academy.id, recordId, signal) });
  const structure = useQuery({ queryKey: structureQueryKey(academy.id), queryFn: () => loadStructure(academy.id) });
  const groups = useQuery({ queryKey: groupListQueryKey(academy.id, false), queryFn: () => loadGroups(academy.id), enabled: informationOpen });
  const archivedGroups = useQuery({ queryKey: groupListQueryKey(academy.id, true), queryFn: () => loadGroups(academy.id, { archived: true }), enabled: informationOpen });
  const student = record.data;
  const returnParams = new URLSearchParams(returnQuery);
  returnParams.delete("record");
  const listPath = `/app/students${returnParams.size ? `?${returnParams}` : ""}`;
  useBreadcrumbTitle(student?.fullName ?? "Student", { label: "Students", href: href(listPath) });
  const track = structure.data?.historicalTracks.find(item => item.id === student?.trackId);
  const group = [...(groups.data?.groups ?? []), ...(archivedGroups.data?.groups ?? [])].find(item => item.id === student?.primaryGroupId);
  const fields = student ? [
    ["Student phone", formatPhone(student.studentPhone)], ["Parent phone", formatPhone(student.parentPhone)],
    ["Level", structure.data?.levelNames[student.levelId] ?? student.levelId],
    ["Track", student.trackId ? track?.name ?? (structure.isPending ? "Loading…" : "Unavailable") : "None"],
    ["Group", student.primaryGroupId ? group?.name ?? (groups.isPending || archivedGroups.isPending ? "Loading…" : "Unavailable") : "Unassigned"],
    ["Participation", PARTICIPATION_LABELS[student.participationType]],
    ["Online account", student.onlineAccount === "connected" ? "Connected" : student.onlineAccount === "suspended" ? "Access suspended" : "Not connected"],
  ] : [];
  return <main className="page-shell">
    {record.isPending && <p role="status">Loading student…</p>}
    {record.isError && <div role="alert" className="space-y-3"><p>{record.error instanceof StudentRequestError && record.error.status === 404 ? "Student not found" : "Couldn’t load student"}</p><Button variant="outline" onClick={() => void record.refetch()}>Retry</Button></div>}
    {student && <>
      <Dialog open={informationOpen} onOpenChange={setInformationOpen}>
        <HeaderActions><DialogTrigger asChild><Button variant="ghost">Contact & placement</Button></DialogTrigger><Button variant="outline" onClick={() => setEditing(true)}><HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={1.5} />Edit student</Button></HeaderActions>
        <DialogContent aria-describedby={undefined} className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Contact & placement</DialogTitle></DialogHeader><Card className="gap-0 divide-y px-5 py-0 shadow-none">{fields.map(([label,value])=><div key={label} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]"><span className="text-sm text-muted-foreground">{label}</span><span dir="auto" className="break-words text-sm font-medium">{value}</span></div>)}</Card></DialogContent>
      </Dialog>
      <header className="space-y-3"><h1 dir="auto" className="break-words text-2xl font-bold tracking-tight">{student.fullName}</h1><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{student.archivedAt ? "Archived" : "Active"}</Badge><span className="text-sm text-muted-foreground">{[structure.data?.levelNames[student.levelId],track?.name,PARTICIPATION_LABELS[student.participationType]].filter(Boolean).join(" · ")}</span></div></header>
      {(structure.isError || groups.isError || archivedGroups.isError) && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">Couldn’t load placement labels.<Button variant="outline" size="sm" onClick={() => { if (structure.isError) void structure.refetch(); if (groups.isError) void groups.refetch(); if (archivedGroups.isError) void archivedGroups.refetch(); }}>Retry</Button></div>}
      <div className={`grid items-start gap-5 ${student.participationType === "in_person" ? "xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" : ""}`}>
        <StudentAssessments academyId={academy.id} recordId={student.id} base={href("/app")} />
        {student.participationType === "in_person" && <StudentAttendance academyId={academy.id} yearId={student.academicYearId} recordId={student.id} base={href("/app")} />}
      </div>
      <StudentLearning academyId={academy.id} recordId={student.id} base={href("/app")} />
      <StudentEditSheet academy={academy} recordId={editing ? recordId : null} onClose={() => setEditing(false)} />
    </>}
  </main>;
}
