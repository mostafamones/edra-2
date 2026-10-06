"use client";

import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { IconUserPlus } from "@tabler/icons-react";
import { toast } from "sonner";

import { PhoneInput } from "@/components/shared/app-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAcademyScope } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";

import { createStaffInvitation } from "../actions";
import { copyInvitationLink } from "../clipboard";
import { ROLE_LABELS } from "../format";
import { invitableRoles, type InvitableRole } from "../permissions";
import { staffQueryKeys } from "../queries";
import { staffInvitationSchema } from "../validation";

export function InviteDialog({ academy, userId }: { academy: AcademyEntry; userId: string }) {
  const roles = invitableRoles(academy.role);
  const queryClient = useQueryClient();
  const isCurrent = useAcademyScope();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<InvitableRole>(roles.at(-1) ?? "instructor");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitLocked = useRef(false);
  const validInput = staffInvitationSchema.safeParse({ phone, role }).success;

  function reset(next: boolean) {
    setOpen(next);
    if (next) return;
    setPhone("");
    setRole(roles.at(-1) ?? "instructor");
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLocked.current) return;
    const parsed = staffInvitationSchema.safeParse({ phone, role });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the phone number and role."); return; }
    const academyId = academy.id;
    submitLocked.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const request = createStaffInvitation({ academyId, ...parsed.data });
      const copying = copyInvitationLink(request.then((result) => {
        if (!result.ok || !isCurrent(academyId)) throw new Error("Invitation unavailable");
        return result.invitation.link;
      }), event.currentTarget).then(() => true, () => false);
      const result = await request;
      if (!isCurrent(academyId)) return;
      if (!result.ok) { setError(result.message); return; }
      const copied = await copying;
      if (!isCurrent(academyId)) return;
      const invitation = result.invitation;
      reset(false);
      toast.success(copied ? "Invite created and copied to clipboard." : "Invite created. Copy the link to share it.", {
        action: copied ? undefined : {
          label: "Copy link",
          onClick: () => {
            void copyInvitationLink(invitation.link, document.body).then(
              () => toast.success("Invitation link copied."),
              () => toast.error("Couldn’t copy the link. Use Copy link on the invitation card."),
            );
          },
        },
      });
    } catch {
      if (isCurrent(academyId)) setError("The invitation couldn’t be created. Check your connection and try again.");
    } finally {
      submitLocked.current = false;
      setSubmitting(false);
      void queryClient.invalidateQueries({ queryKey: staffQueryKeys.invitations(userId, academyId) });
    }
  }

  if (!roles.length) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) reset(next); }}>
      <DialogTrigger asChild><Button><IconUserPlus aria-hidden="true" />Invite staff</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
          <form onSubmit={(event) => void submit(event)} className="grid gap-5" noValidate>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold leading-tight">Invite staff</DialogTitle>
              <DialogDescription>
                Create a link to share. Expires in 7 days.
              </DialogDescription>
            </DialogHeader>
            <Tabs value={role} onValueChange={(value) => { setRole(value as InvitableRole); setError(null); }}>
              <Field>
                <FieldLabel id="invite-details-label">Invitee details</FieldLabel>
                <TabsList aria-labelledby="invite-details-label" className="w-full">
                  {roles.map((option) => <TabsTrigger key={option} value={option} disabled={submitting}>{ROLE_LABELS[option]}</TabsTrigger>)}
                </TabsList>
              </Field>
              {roles.map((option) => (
                <TabsContent key={option} value={option}>
                  <PhoneInput aria-label="Phone number" value={phone} disabled={submitting} onChange={(event) => { setPhone(event.target.value); setError(null); }} placeholder="10 1234 5678" />
                </TabsContent>
              ))}
            </Tabs>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={submitting} onClick={() => reset(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting || !validInput}>{submitting ? "Inviting…" : "Invite"}</Button>
            </DialogFooter>
          </form>
      </DialogContent>
    </Dialog>
  );
}
