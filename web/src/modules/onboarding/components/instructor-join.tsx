"use client";
import { staffAcademyHref } from "@/lib/routing";
import { listUserAcademies } from "@/modules/academies";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/shared/app-input";
import { useAuth } from "@/modules/auth";
import { acceptStaffInvitation, clearStaffInvitation, isTerminalJoinState, openStaffInvitationLink, parseStaffInviteLink, previewStaffInvitation, type StaffJoinState } from "@/modules/staff/join";

import { instructorJoinCopy as copy } from "../copy/instructor-join";
import { OnboardingContentTransition } from "./content-transition";
import { OnboardingFooter } from "./footer";
import { OnboardingFrame } from "./frame";

type Detailed = Extract<StaffJoinState, { academy: unknown }>;

const MESSAGE_STATES: Partial<Record<StaffJoinState["kind"], { title: string; description: string }>> = {
  expired: copy.states.expired,
  revoked: copy.states.revoked,
  inviter_unavailable: copy.states.inviterUnavailable,
  unavailable: copy.states.unavailable,
  wrong_account: copy.states.wrongAccount,
  unverified: copy.states.unverified,
  unauthenticated: copy.states.unverified,
  rate_limited: copy.states.rateLimited,
  error: copy.states.error,
};

function hasAcademy(state: StaffJoinState): state is Detailed {
  return "academy" in state;
}

export function InstructorJoin({ state: initialState }: { state: StaffJoinState }) {
  const router = useRouter();
  const { user, refreshAcademies } = useAuth();
  // Keep the current result visible after cookie cleanup; a full refresh starts from the server again.
  const [state, setState] = useState<StaffJoinState>(initialState);
  const cleanup = useRef<Promise<void> | null>(null);
  const [invite, setInvite] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joining, setJoining] = useState(false);

  // Only prefetch a protected page once this account has membership there.
  const accessibleSlug = "academy" in state
    ? state.academy.slug : null;
  const canPrefetch = state.kind === "joined" || state.kind === "accepted" || state.kind === "already_member";
  useEffect(() => {
    if (canPrefetch && accessibleSlug) router.prefetch(staffAcademyHref(accessibleSlug));
  }, [canPrefetch, accessibleSlug, router]);

  useEffect(() => {
    if (!isTerminalJoinState(initialState)) return;
    cleanup.current = previewStaffInvitation().then(() => {}, () => {});
  }, [initialState]);

  async function submitLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!invite.trim()) { setMessage(copy.messages.emptyInvite); return; }
    setBusy(true);
    try {
      // Let an earlier cleanup response finish before setting a new invitation cookie.
      await cleanup.current;
      const opened = await openStaffInvitationLink(invite);
      if (!opened.ok) { setMessage(opened.message); return; }
      setInvite("");
      setState(opened.state);
    } catch {
      setMessage(copy.states.error.description);
    } finally {
      setBusy(false);
    }
  }

  async function openAcademy(academyId: string, slug: string) {
    setBusy(true);
    setMessage(null);
    try {
      if (!user) throw new Error("Account is still loading.");
      await clearStaffInvitation();
      const href = staffAcademyHref(slug);
      const destination = new URL(href);
      const sameOrigin = destination.origin === window.location.origin;
      if (sameOrigin) router.prefetch(destination.pathname);
      const [, memberships] = await Promise.all([
        refreshAcademies(academyId),
        user ? listUserAcademies(user.id) : Promise.resolve([]),
      ]);
      const academy = memberships.find((entry) => entry.id === academyId);
      if (!academy) {
        setState({ kind: "unavailable" });
        setBusy(false);
        return false;
      }
      if (sameOrigin) router.replace(destination.pathname, { transitionTypes: ["academy-join"] });
      else window.location.assign(href);
      return true;
    } catch {
      setBusy(false);
      setMessage(copy.states.error.description);
      return false;
    }
  }

  async function join() {
    if (busy) return;
    setBusy(true);
    setJoining(true);
    setMessage(null);
    let next: StaffJoinState;
    try {
      next = await acceptStaffInvitation();
    } catch {
      setBusy(false);
      setJoining(false);
      setMessage(copy.messages.joinFailed);
      return;
    }
    if ((next.kind === "joined" || next.kind === "accepted") && hasAcademy(next)) {
      const opening = await openAcademy(next.academy.id, next.academy.slug);
      if (!opening) setJoining(false);
      return;
    }
    setBusy(false);
    setJoining(false);
    if (next.kind === "error") setMessage(copy.messages.joinFailed);
    else setState(next);
  }

  async function retry() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      setState(await previewStaffInvitation());
    } catch {
      setMessage(copy.states.error.description);
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await cleanup.current;
      await clearStaffInvitation();
      setInvite("");
      setState({ kind: "none" });
    } catch {
      setMessage(copy.states.error.description);
    } finally {
      setBusy(false);
    }
  }

  const pasteForm = (
    <form onSubmit={(event) => void submitLink(event)} className="mt-9 flex items-end gap-3">
      <TextInput
        label={copy.inviteLabel}
        value={invite}
        onChange={(event) => {
          const value = event.target.value;
          setInvite(parseStaffInviteLink(value, window.location.origin) ?? value);
          setMessage(null);
        }}
        containerClassName="min-w-0 flex-1"
        placeholder={copy.invitePlaceholder}
        autoComplete="off"
        autoFocus
      />
      <Button type="submit" className="h-10 shrink-0" disabled={busy}>{copy.actions.continue}<IconArrowRight className="size-4" /></Button>
    </form>
  );

  let body: ReactNode;
  let showPaste = false;
  let primary: ReactNode = null;

  if (state.kind === "none") {
    body = <Heading title={copy.title} description={copy.description} />;
    showPaste = true;
  } else if (state.kind === "valid") {
    const role = copy.roles[state.role];
    body = <Heading
      title={<AcademyTitle prefix={copy.states.valid.title} name={state.academy.name} />}
      description={copy.states.valid.description(role)}
    />;
    primary = <Button type="button" disabled={busy} onClick={() => void join()}>{joining ? copy.actions.joining : copy.actions.join}<IconArrowRight className="size-4" /></Button>;
  } else if ((state.kind === "accepted" || state.kind === "joined" || state.kind === "already_member") && hasAcademy(state)) {
    const text = state.kind === "already_member" ? copy.states.alreadyMember : copy.states.accepted;
    body = <Heading title={<AcademyTitle prefix={text.title} name={state.academy.name} />} description={text.description} />;
    primary = <Button type="button" disabled={busy} onClick={() => void openAcademy(state.academy.id, state.academy.slug)}>{copy.actions.openAcademy}<IconArrowRight className="size-4" /></Button>;
  } else {
    const text = MESSAGE_STATES[state.kind] ?? copy.states.error;
    body = <Heading title={text.title} description={text.description} />;
    if (state.kind === "error") primary = <Button type="button" disabled={busy} onClick={() => void retry()}>{copy.actions.retry}</Button>;
    if (["expired", "revoked", "inviter_unavailable", "unavailable"].includes(state.kind)) showPaste = true;
  }

  return (
    <OnboardingFrame progress={1} progressLabel={copy.progressLabel}>
      <div className="flex flex-1 flex-col">
        <OnboardingContentTransition>
          <div className="flex flex-1 flex-col justify-center py-8">
            {body}
            {showPaste && pasteForm}
            {message && <p role="status" className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">{message}</p>}
          </div>
        </OnboardingContentTransition>
        <OnboardingFooter
          left={state.kind === "none"
            ? <Button type="button" variant="ghost" asChild className="-ml-2"><Link href="/onboarding?mode=instructor"><IconArrowLeft className="size-4" />{copy.actions.back}</Link></Button>
            : <Button type="button" variant="ghost" className="-ml-2" disabled={busy} onClick={() => void decline()}><IconArrowLeft className="size-4" />{copy.actions.back}</Button>}
          right={primary ?? undefined}
        />
      </div>
    </OnboardingFrame>
  );
}

function AcademyTitle({ prefix, name }: { prefix: string; name: string }) {
  return <><span className="font-normal tracking-normal">{prefix}</span> <span className="font-semibold tracking-[-0.045em]">{name}</span></>;
}

function Heading({ title, description }: { title: ReactNode; description: string }) {
  return (
    <>
      <h1 className="text-balance text-3xl font-semibold tracking-[-0.045cem] sm:text-[2.55rem]">{title}</h1>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
    </>
  );
}
