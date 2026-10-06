"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconAlertCircle } from "@tabler/icons-react";

import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AcademyEntry } from "@/modules/academies";
import { AcademyGate, useAuth } from "@/modules/auth";
import { loadStructure, structureQueryKey } from "@/modules/groups";

import { canConfigureStudentCodes } from "../permissions";
import { fetchLevelStudentCounts, fetchStudentCodeSettings, studentCodeQueryKeys } from "../queries";
import type { StudentCodeSettings } from "../types";
import { StudentCodeSettingsEditor } from "./editor";
import { RetiredStudentCodes } from "./retired";
import { StudentCodeSettingsSummary } from "./summary";

/** Manage → Student codes: activation and formats. Configuration only; issues no codes. */
export function StudentCodesPage() {
  return <AcademyGate>{(academy) => <StudentCodes academy={academy} />}</AcademyGate>;
}

function StudentCodes({ academy }: { academy: AcademyEntry }) {
  useBreadcrumbTitle("Student codes");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const settingsKey = studentCodeQueryKeys.settings(user?.id ?? "", academy.id);
  // A draft is never replaced behind the user's back: reloads are explicit.
  const settingsQuery = useQuery({
    queryKey: settingsKey,
    queryFn: ({ signal }) => fetchStudentCodeSettings(academy.id, signal),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const structureQuery = useQuery({ queryKey: structureQueryKey(academy.id), queryFn: () => loadStructure(academy.id) });
  // Counts are a hint only: a failure leaves the subtext out instead of blocking the page.
  const levelIds = structureQuery.data?.levels.map((level) => level.level_id) ?? [];
  const countsQuery = useQuery({
    queryKey: [...studentCodeQueryKeys.levelStudents(academy.id), levelIds],
    queryFn: () => fetchLevelStudentCounts(academy.id, levelIds),
    enabled: structureQuery.isSuccess,
  });
  const canConfigure = canConfigureStudentCodes(academy.role);

  let body: React.ReactNode;
  if (settingsQuery.isPending || structureQuery.isPending) {
    body = (
      <Skeleton className="h-80 w-full" />
    );
  } else if (settingsQuery.isError || structureQuery.isError) {
    body = (
      <Alert variant="destructive">
        <IconAlertCircle aria-hidden="true" />
        <AlertTitle>Couldn’t load student codes</AlertTitle>
        <AlertDescription>
          Check your connection and try again.
          <Button type="button" variant="outline" size="sm" className="mt-2"
            onClick={() => { void settingsQuery.refetch(); void structureQuery.refetch(); }}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else {
    const { levels, levelNames } = structureQuery.data;
    const levelOptions = levels.map((level) => ({ levelId: level.level_id, name: levelNames[level.level_id] ?? level.level_id, students: countsQuery.data?.[level.level_id] }));
    const settings = settingsQuery.data;
    body = canConfigure ? (
      <StudentCodeSettingsEditor
        key={settings.version}
        academyId={academy.id}
        settings={settings}
        levels={levelOptions}
        onSaved={(saved: StudentCodeSettings) => queryClient.setQueryData(settingsKey, saved)}
        onReload={() => {
          void queryClient.invalidateQueries({ queryKey: settingsKey });
          void queryClient.invalidateQueries({ queryKey: structureQueryKey(academy.id) });
        }}
      />
    ) : (
      <StudentCodeSettingsSummary settings={settings} levels={levelOptions} />
    );
  }

  return (
    <main className="page-shell min-w-0">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-bold tracking-tight">Student codes</h1>
          <p className="text-sm text-muted-foreground">Optional short codes to identify students.</p>
        </div>
        {body}
        {structureQuery.data && (
          <RetiredStudentCodes academyId={academy.id} levelNames={structureQuery.data.levelNames} canUnretire={canConfigure} />
        )}
      </div>
    </main>
  );
}
