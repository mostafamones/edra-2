"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import { AcademyGate } from "@/modules/auth";
import { useCanonicalHref } from "@/modules/navigation";
import { loadStructure, structureQueryKey, loadGroups, groupListQueryKey } from "@/modules/groups";
import type { AcademyEntry } from "@/modules/academies";
import { fetchStudentRecord, studentRecordQueryKey, StudentRequestError } from "../queries";
import { studentAttendanceOptions, studentLearningOptions } from "../overview";
import { PARTICIPATION_LABELS } from "../validation";
import { StudentFacts } from "./facts";
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
  const record = useQuery({ queryKey: studentRecordQueryKey(academy.id, recordId), queryFn: ({ signal }) => fetchStudentRecord(academy.id, recordId, signal) });
  const student = record.data;
  const physical = student?.participationType === "in_person";
  const structure = useQuery({ queryKey: structureQueryKey(academy.id), queryFn: () => loadStructure(academy.id) });
  const hasGroup = physical && Boolean(student?.primaryGroupId);
  const groups = useQuery({ queryKey: groupListQueryKey(academy.id, false), queryFn: () => loadGroups(academy.id), enabled: hasGroup });
  const archivedGroups = useQuery({ queryKey: groupListQueryKey(academy.id, true), queryFn: () => loadGroups(academy.id, { archived: true }), enabled: hasGroup });
  const placement = student ? [student.academicYearId, student.levelId, student.trackId ?? "", student.participationType, student.archivedAt ?? "", student.onlineAccount].join(":") : "";
  const learning = useQuery({ ...studentLearningOptions(academy.id, recordId, 0, placement), enabled: Boolean(student) });
  const attendance = useQuery({ ...studentAttendanceOptions(academy.id, student?.academicYearId ?? "", recordId), enabled: physical });
  const returnParams = new URLSearchParams(returnQuery);
  returnParams.delete("record");
  useBreadcrumbTitle(student?.fullName ?? "Student", { label: "Students", href: href(`/app/students${returnParams.size ? `?${returnParams}` : ""}`) });
  const track = structure.data?.historicalTracks.find(item => item.id === student?.trackId);
  const group = [...(groups.data?.groups ?? []), ...(archivedGroups.data?.groups ?? [])].find(item => item.id === student?.primaryGroupId);
  const base = href("/app");

  return <article className="page-shell" aria-label="Student record">
    {record.isPending && <p role="status">Loading student…</p>}
    {record.isError && <div role="alert" className="space-y-3"><p>{record.error instanceof StudentRequestError && record.error.status === 404 ? "Student not found" : "Couldn’t refresh student"}</p><Button variant="outline" onClick={() => void record.refetch()}>Retry</Button></div>}
    {student && <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 dir="auto" className="break-words text-2xl font-semibold tracking-tight">{student.fullName}</h1>
          <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{student.archivedAt ? "Archived" : "Active"}</Badge><Badge variant="secondary">{PARTICIPATION_LABELS[student.participationType]}</Badge>{physical && <span className="text-xs text-muted-foreground">{{ connected: "Account connected", suspended: "Account suspended", not_connected: "Account not connected" }[student.onlineAccount]}</span>}</div>
        </div>
        <Button variant="secondary" onClick={() => setEditing(true)}>{student.archivedAt ? "View archived record" : "Edit student"}</Button>
      </header>
      <StudentFacts student={student} grade={structure.data?.levelNames[student.levelId] ?? (structure.isPending ? "Loading grade…" : "Grade unavailable")} track={student.trackId ? track?.name ?? "Track unavailable" : undefined} group={student.primaryGroupId ? group?.name ?? (groups.isPending || archivedGroups.isPending ? "Loading group…" : "Group unavailable") : "No group assigned"} />
      {(structure.isError || groups.isError || archivedGroups.isError) && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">Couldn’t load placement labels.<Button variant="outline" size="sm" onClick={() => { if (structure.isError) void structure.refetch(); if (groups.isError) void groups.refetch(); if (archivedGroups.isError) void archivedGroups.refetch(); }}>Retry</Button></div>}
      {physical && <StudentAttendance query={attendance} base={base} />}
      <StudentLearning key={placement} academyId={academy.id} recordId={student.id} placement={placement} query={learning} base={base} />
      <StudentAssessments academyId={academy.id} recordId={student.id} base={base} />
      <StudentEditSheet academy={academy} recordId={editing ? recordId : null} onClose={() => setEditing(false)} />
    </>}
  </article>;
}
