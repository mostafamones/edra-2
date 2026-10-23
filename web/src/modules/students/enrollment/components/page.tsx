"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconAlertCircle, IconCopy } from "@tabler/icons-react";
import { toast } from "sonner";

import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AcademyEntry } from "@/modules/academies";
import { AcademyGate } from "@/modules/auth";
import { copyInvitationLink } from "@/modules/staff";

import { getStudentEnrollmentSettings, setStudentInvite, updateStudentEnrollmentSettings } from "../actions";
import type { EnrollmentSettings } from "../types";

/** Manage → Student enrollment: every staff role can copy the link; managers turn it on, replace or turn it off. */
export function StudentEnrollmentPage() {
  return <AcademyGate>{(academy) => <StudentEnrollment academy={academy} />}</AcademyGate>;
}

type Result = Awaited<ReturnType<typeof getStudentEnrollmentSettings>>;

function StudentEnrollment({ academy }: { academy: AcademyEntry }) {
  useBreadcrumbTitle("Student enrollment");
  const queryClient = useQueryClient();
  const key = ["student-enrollment", academy.id] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const result = await getStudentEnrollmentSettings(academy.id);
      if (!result.ok) throw new Error(result.error);
      return result.settings;
    },
  });
  const change = useMutation({
    mutationFn: async ({ action }: { action: () => Promise<Result>; success?: string }) => {
      const result = await action();
      if (!result.ok) throw new Error(result.error);
      return result.settings;
    },
    onSuccess: (settings, { success }) => {
      queryClient.setQueryData<EnrollmentSettings>(key, settings);
      if (success) toast.success(success);
    },
    onError: (error) => toast.error(error.message === "forbidden" ? "You don’t have permission to do that." : "Couldn’t save the change. Try again."),
  });
  const [linkBox, setLinkBox] = useState<HTMLElement | null>(null);

  async function copy(link: string) {
    try {
      await copyInvitationLink(link, linkBox!);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn’t copy the link. Select it and copy it manually.");
    }
  }

  const settings = query.data;
  return (
    <section className="min-w-0">
      <div className="flex w-full flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-heading text-2xl font-bold tracking-tight">Student enrollment</h2>
            <p className="text-sm text-muted-foreground">Share one link so students can join the academy online.</p>
          </div>
          {settings?.canManage && (
            <Tabs value={settings.enrollmentOpen ? "on" : "off"}
              onValueChange={(value) => change.mutate({ action: () => updateStudentEnrollmentSettings(academy.id, { enrollmentOpen: value === "on" }) })}>
              <TabsList aria-label="Accept new students" className="h-9">
                <TabsTrigger value="off" disabled={change.isPending} className="min-w-14 px-3 data-[state=active]:bg-background">Off</TabsTrigger>
                <TabsTrigger value="on" disabled={change.isPending} className="min-w-14 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">On</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>

        {query.isPending && <Skeleton className="h-48 w-full" />}
        {query.isError && (
          <Alert variant="destructive">
            <IconAlertCircle aria-hidden="true" />
            <AlertTitle>Couldn’t load the invite link</AlertTitle>
            <AlertDescription>
              Check your connection and try again.
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void query.refetch()}>Try again</Button>
            </AlertDescription>
          </Alert>
        )}

        {settings && (
          <Card>
            <CardHeader>
              <CardTitle>Invite link</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {settings.link ? (
                <div ref={setLinkBox} className="flex gap-2">
                  <Input readOnly value={settings.link} aria-label="Student invite link" onFocus={(event) => event.currentTarget.select()} />
                  <Button type="button" variant="outline" onClick={() => void copy(settings.link!)}><IconCopy />Copy</Button>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
                  {settings.canManage ? "The invite link is off." : "There’s no invite link yet. Ask an admin to create one."}
                </p>
              )}

              {settings.canManage && (
                <>
                  <div className="flex flex-wrap justify-end gap-2">
                    {settings.link && (
                      <Button type="button" variant="outline" disabled={change.isPending}
                        onClick={() => change.mutate({ action: () => setStudentInvite(academy.id, false), success: "Invite link turned off" })}>Turn off link</Button>
                    )}
                    <Button type="button" disabled={change.isPending}
                      onClick={() => change.mutate({ action: () => setStudentInvite(academy.id, true), success: settings.link ? "Invite link replaced" : "Invite link created" })}>
                      {settings.link ? "Replace link" : "Create link"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}
