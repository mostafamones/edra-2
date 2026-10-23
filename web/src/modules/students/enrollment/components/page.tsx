"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconAlertCircle, IconCheck, IconCopy, IconRefresh } from "@tabler/icons-react";
import { toast } from "sonner";

import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import { SettingsGroup } from "@/components/shared/settings-group";
import { SettingsRow as Row } from "@/components/shared/settings-row";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { AcademyEntry } from "@/modules/academies";
import { AcademyGate } from "@/modules/auth";
import { copyInvitationLink } from "@/modules/staff";

import { StudentCodesRow } from "../../codes/components/page";
import { getStudentEnrollmentSettings, setStudentInvite, updateStudentEnrollmentSettings } from "../actions";
import type { EnrollmentSettings } from "../types";

/** General → Enrollment: every staff role can copy the link; managers open enrollment, reset the link, and configure student codes. */
export function StudentEnrollmentPage() {
  return <AcademyGate>{(academy) => <StudentEnrollment academy={academy} />}</AcademyGate>;
}

type Result = Awaited<ReturnType<typeof getStudentEnrollmentSettings>>;

function StudentEnrollment({ academy }: { academy: AcademyEntry }) {
  useBreadcrumbTitle("Students");
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
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  async function copy(link: string) {
    try {
      await copyInvitationLink(link, linkBox!);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn’t copy the link. Select it and copy it manually.");
    }
  }

  const settings = query.data;
  const busy = change.isPending;
  return (
    <section className="flex min-w-0 flex-col gap-10">
      {query.isPending && <Skeleton className="h-36 w-full" />}
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
        <SettingsGroup title="Enrollment">
          <Row id="enrollment-open" title="Accept new students" description="Let students join the academy online with the invite link.">
            {settings.canManage ? (
              <Switch id="enrollment-open" checked={settings.enrollmentOpen} disabled={busy}
                onCheckedChange={(open) => change.mutate({ action: () => updateStudentEnrollmentSettings(academy.id, { enrollmentOpen: open }) })} />
            ) : (
              <Badge variant={settings.enrollmentOpen ? "default" : "secondary"}>{settings.enrollmentOpen ? "On" : "Off"}</Badge>
            )}
          </Row>

          <Row id="invite-link" title="Invite link" description="Share this link with students.">
            <div ref={setLinkBox} className="flex min-w-0 items-center gap-1">
              {settings.link ? (
                <>
                  {settings.canManage && (
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Reset invite link" disabled={busy} onClick={() => setConfirmReset(true)}><IconRefresh className="text-muted-foreground!" /></Button>
                  )}
                  <InputGroup className="h-8 w-92 border-transparent bg-muted/60 shadow-none dark:bg-muted/60">
                    <InputGroupInput id="invite-link" readOnly dir="ltr" value={decodeURIComponent(settings.link.slice(settings.link.lastIndexOf("/") + 1))} className="text-muted-foreground"
                      onFocus={(event) => event.currentTarget.select()} />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton size="xs" className="text-foreground!" aria-label={copied ? "Copied" : "Copy invite link"} onClick={() => void copy(settings.link!)}>
                        {copied ? <><IconCheck /> Copied</> : <><IconCopy /> Copy</>}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </>
              ) : settings.canManage ? (
                <Button type="button" variant="outline" size="sm" disabled={busy}
                  onClick={() => change.mutate({ action: () => setStudentInvite(academy.id, true), success: "Invite link created" })}>Create link</Button>
              ) : (
                <span className="text-sm text-muted-foreground">No link yet. Ask an admin to create one.</span>
              )}
            </div>
          </Row>
        </SettingsGroup>
      )}
      {settings && (
        <SettingsGroup title="Student codes">
          <StudentCodesRow academy={academy} />
        </SettingsGroup>
      )}
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the invite link?</AlertDialogTitle>
            <AlertDialogDescription>The current link stops working right away. Share the new link with students who haven’t joined yet.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive"
              onClick={() => change.mutate({ action: () => setStudentInvite(academy.id, true), success: "Invite link reset" })}>Reset link</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
