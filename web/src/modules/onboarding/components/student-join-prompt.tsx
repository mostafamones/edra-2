"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { IconArrowRight } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/shared/app-input";
import { openStudentInviteLink, parseStudentInviteLink } from "@/modules/students";

import { studentJoinPromptCopy as copy } from "../copy/student-join-prompt";
import { OnboardingContentTransition } from "./content-transition";
import { OnboardingFooter } from "./footer";
import { OnboardingFrame } from "./frame";

/** Shown after account setup when the student has no academy yet: paste an invite link or skip. */
export function StudentJoinPrompt() {
  const router = useRouter();
  const [invite, setInvite] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const token = parseStudentInviteLink(invite, window.location.origin);
    if (!token) { setMessage(copy.messages.invalidInvite); return; }
    setBusy(true);
    try {
      const opened = await openStudentInviteLink(token);
      if (!opened.ok) throw new Error("rejected");
      router.replace("/onboarding/student/join");
    } catch {
      setBusy(false);
      setMessage(copy.messages.failed);
    }
  }

  // Same first-entry transition as joining an academy.
  function skip() {
    setBusy(true);
    router.replace("/", { transitionTypes: ["academy-join"] });
  }

  return (
    <OnboardingFrame progress={1} progressLabel={copy.progressLabel}>
      <div className="flex flex-1 flex-col">
        <OnboardingContentTransition>
          <div className="flex flex-1 flex-col justify-center py-8">
            <h1 className="text-balance text-3xl font-semibold tracking-[-0.045em] sm:text-[2.55rem]">{copy.title}</h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">{copy.description}</p>
            <form onSubmit={(event) => void submit(event)} className="mt-9 flex items-end gap-3">
              <TextInput
                label={copy.inviteLabel}
                value={invite}
                onChange={(event) => { setInvite(event.target.value); setMessage(null); }}
                containerClassName="min-w-0 flex-1"
                placeholder={copy.invitePlaceholder}
                autoComplete="off"
                autoFocus
              />
              <Button type="submit" className="h-10 shrink-0" disabled={busy}>{copy.actions.continue}<IconArrowRight className="size-4" /></Button>
            </form>
            {message && <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{message}</p>}
          </div>
        </OnboardingContentTransition>
        <OnboardingFooter left={<Button type="button" variant="ghost" className="-ml-2" disabled={busy} onClick={skip}>{copy.actions.skip}</Button>} />
      </div>
    </OnboardingFrame>
  );
}
