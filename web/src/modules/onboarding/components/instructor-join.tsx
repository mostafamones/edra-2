"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/shared/app-input";

import { instructorJoinCopy } from "../copy/instructor-join";
import { OnboardingContentTransition } from "./content-transition";
import { OnboardingFooter } from "./footer";
import { OnboardingFrame } from "./frame";

export function InstructorJoin() {
  const [invite, setInvite] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(invite.trim()
      ? instructorJoinCopy.messages.notConnected
      : instructorJoinCopy.messages.emptyInvite);
  }

  return (
    <OnboardingFrame progress={1} progressLabel={instructorJoinCopy.progressLabel}>
      <form onSubmit={submit} className="flex flex-1 flex-col">
        <OnboardingContentTransition>
          <div className="flex flex-1 flex-col justify-center py-8">
            <h1 className="text-balance text-3xl font-semibold tracking-[-0.045em] sm:text-[2.55rem]">{instructorJoinCopy.title}</h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
              {instructorJoinCopy.description}
            </p>
            <div className="mt-9 space-y-4">
              <TextInput
                label={instructorJoinCopy.inviteLabel}
                value={invite}
                onChange={(event) => { setInvite(event.target.value); setMessage(null); }}
                placeholder={instructorJoinCopy.invitePlaceholder}
                autoComplete="off"
                autoFocus
              />
              {message && <p role="status" className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">{message}</p>}
              <Button variant="link" asChild className="px-0"><Link href="/app">{instructorJoinCopy.actions.skip}</Link></Button>
            </div>
          </div>
        </OnboardingContentTransition>
        <OnboardingFooter
          left={<Button type="button" variant="ghost" asChild className="-ml-2"><Link href="/onboarding"><ArrowLeft className="size-4" />{instructorJoinCopy.actions.back}</Link></Button>}
          right={<Button type="submit">{instructorJoinCopy.actions.continue}<ArrowRight className="size-4" /></Button>}
        />
      </form>
    </OnboardingFrame>
  );
}
