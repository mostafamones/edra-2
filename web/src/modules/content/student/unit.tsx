import { useEffect, useRef, useState } from "react";
import Link from "@/components/shared/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon, File01Icon, PlayIcon, SquareLock01Icon, Task01Icon, Ticket01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { newUuid } from "@/lib/uuid";
import { studentAcademyPath, studentListPath } from "@/lib/routing";
import { useAuth } from "@/modules/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { extendMyUnitAccess, loadLearningUnit, redeemUnitCode } from "../access/actions";
import { accessLabels, isValidAccessCode, learningDate, normalizeUnitCode, type LearningUnit } from "../access/types";
import { KIND_LABELS, unwrapContent } from "../types";
import { StudentMaterial, StudentMaterialViewer } from "./material";
import { LearningProgress } from "../progress/summary";
import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";

type Props = { academyId: string; academySlug: string; userId: string; initial: LearningUnit };

export function StudentLearningUnit(props: Props) {
  return <LearningUnitContent key={JSON.stringify([props.userId, props.academyId, props.initial.id])} {...props} />;
}

function LearningUnitContent({ academyId, academySlug, userId, initial }: Props) {
  const cache = useQueryClient();
  const [code, setCode] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [extensionError, setExtensionError] = useState("");
  const [busy, setBusy] = useState(false), [extending, setExtending] = useState(false);
  const [selection, setSelection] = useState<{ id: string; grantId: string | null } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const moveFocus = useRef(false);
  const codeRequest = useRef<{ code: string; id: string } | null>(null), extensionRequest = useRef<string | null>(null);
  const { user, loading } = useAuth();
  const query = useQuery({ queryKey: ["learning", userId, academyId, "unit", initial.id], enabled: !loading && user?.id === userId, queryFn: async () => {
    const result = unwrapContent(await loadLearningUnit({ academyId, unitId: initial.id }));
    if (result.userId !== userId) throw new Error("Your account changed. Reload this page.");
    return result.unit;
  }, initialData: initial, staleTime: 0, refetchInterval: 60000 });
  const unit = query.data;
  const assessmentAccess = unit.access.status === "active" || unit.access.status === "expired";
  const progress = new Map(unit.progress?.items.map(item => [item.itemId, item]));
  const videos = unit.items.filter(item => item.kind === "explanation");
  const playable = videos.filter(item => item.available && unit.access.status === "active");
  const unfinished = playable.filter(item => !progress.get(item.id)?.completed);
  const next = unfinished.find(item => (progress.get(item.id)?.positionSeconds ?? 0) > 0)
    ?? unfinished.find(item => (progress.get(item.id)?.watchedSeconds ?? 0) > 0) ?? unfinished[0];
  const current = selection && selection.grantId === unit.access.grantId ? playable.find(item => item.id === selection.id) : undefined;
  useEffect(() => {
    if (moveFocus.current) { moveFocus.current = false; heading.current?.focus(); }
  }, [current?.id]);
  function selectLesson(id: string | null) {
    if ((current?.id ?? null) === id) return;
    moveFocus.current = true;
    setSelection(id ? { id, grantId: unit.access.grantId } : null);
  }
  const held = assessmentAccess;
  useBreadcrumbTitle(!loading && user?.id === userId ? unit.title : "Course", { label: held ? "My courses" : "Discover", href: studentListPath(held ? "courses" : "discover") });
  async function refresh() { await cache.invalidateQueries({ queryKey: ["learning", userId, academyId] }); }
  async function redeem() {
    const normalized = normalizeUnitCode(code);
    if (!isValidAccessCode(normalized)) { setError("Enter a valid coupon."); return; }
    if (codeRequest.current?.code !== normalized) codeRequest.current = { code: normalized, id: newUuid() };
    setBusy(true); setError(""); setNotice("");
    try { const result = unwrapContent(await redeemUnitCode({ academyId, unitId: unit.id, code: normalized, requestId: codeRequest.current.id })); setCode(""); codeRequest.current = null; setNotice(`Access granted until ${learningDate(result.expiresAt)}.`); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not redeem this code."); }
    finally { setBusy(false); }
  }
  async function extend() {
    extensionRequest.current ??= newUuid(); setBusy(true); setExtensionError(""); setNotice("");
    try { const result = unwrapContent(await extendMyUnitAccess({ academyId, unitId: unit.id, requestId: extensionRequest.current })); extensionRequest.current = null; setExtending(false); setNotice(`Extended until ${learningDate(result.expiresAt)}. No extensions left for this academy this academic year.`); await refresh(); }
    catch (e) { setExtensionError(e instanceof Error ? e.message : "Could not activate the extension."); }
    finally { setBusy(false); }
  }
  if (loading || user?.id !== userId) return <main className="page-shell"><p role="status">{loading ? "Loading…" : "Reload to continue with your current account."}</p>{!loading && <Button onClick={() => window.location.reload()}>Reload</Button>}</main>;
  if (query.isError) return <main className="page-shell"><p role="alert">{query.error.message}</p><Button variant="outline" onClick={() => query.refetch()}>Retry</Button></main>;
  const missing = unit.prerequisitesMet ? undefined : unit.prerequisites.find(requirement => !requirement.submitted);
  const prerequisiteHref = (id: string) => studentAcademyPath(academySlug, `units/${id}`);
  const back = held ? "My courses" : "Discover";
  const resumePosition = next ? progress.get(next.id)?.positionSeconds ?? 0 : 0;
  const nextDuration = next ? progress.get(next.id)?.durationSeconds : null;
  const minutesRemaining = nextDuration && nextDuration > resumePosition ? Math.ceil((nextDuration - resumePosition) / 60) : null;
  const showAccessForm = unit.access.status !== "active";
  const expired = unit.access.status === "expired";
  const outline = <section aria-labelledby="course-content-title" className={cn("min-w-0 space-y-3", current && "rounded-xl border bg-card p-4")}>
    <div className="flex items-baseline justify-between gap-3">
      <h2 id="course-content-title" className="font-heading text-lg font-semibold">{current ? "Course outline" : "Course content"}</h2>
      <span className="shrink-0 text-sm text-muted-foreground">{unit.items.length} {unit.items.length === 1 ? "item" : "items"}</span>
    </div>
    {!unit.items.length ? <Empty><EmptyHeader><EmptyTitle>No learning material</EmptyTitle></EmptyHeader></Empty> : <ol className="space-y-0.5">
      {unit.items.map(item => {
        const state = progress.get(item.id);
        const assignment = item.kind === "assessment" && item.assessmentKind === "assignment" && item.assessmentId;
        const available = item.available && (item.kind === "answer" || (item.kind === "assessment" ? assessmentAccess : unit.access.status === "active"));
        const selected = (current ?? next)?.id === item.id;
        const icon = !available ? SquareLock01Icon : state?.completed ? Tick02Icon : item.kind === "document" ? File01Icon : item.kind === "assessment" ? Task01Icon : PlayIcon;
        const title = <><span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted", selected && "bg-card", state?.completed && available && "text-primary")}><HugeiconsIcon icon={icon} strokeWidth={1.5} className="size-[18px]" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1 space-y-0.5"><span className="block break-words text-sm font-semibold">{item.title}</span><span className="block text-xs text-muted-foreground">
            {item.kind === "explanation" ? "Video" : item.kind === "assessment" && item.assessmentKind ? { assignment: "Assignment", quiz: "Quiz", exam: "Exam" }[item.assessmentKind] : KIND_LABELS[item.kind]}
            {item.kind === "explanation" && state?.durationSeconds ? ` · ${Math.ceil(state.durationSeconds / 60)} min` : ""}
          </span></span></>;
        const status = !available ? (item.kind === "assessment" && assessmentAccess ? "Unavailable" : "Locked") : state?.completed ? (item.kind === "explanation" ? "Watched" : "Submitted") : state?.watchedSeconds ? "In progress" : item.kind === "assessment" && state ? "Not submitted" : "";
        const badge = <span className="shrink-0 text-xs text-muted-foreground">{status}</span>;
        const row = cn("flex min-h-14 w-full items-center gap-3 rounded-lg border border-transparent p-2.5 text-start sm:px-3", selected && "border-border bg-muted", !available && "text-muted-foreground");
        return <li key={item.id}>
          {available && item.kind === "explanation" ? <Button type="button" variant="ghost" aria-current={current?.id === item.id ? "true" : undefined} aria-label={item.title} className={cn(row, "h-auto justify-start whitespace-normal font-normal")} onClick={() => selectLesson(item.id)}>{title}{badge}<HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} className="size-4 text-muted-foreground" aria-hidden="true" /></Button>
            : <div className={row}>{title}
              {!available && state?.completed && <span className="shrink-0 text-xs text-muted-foreground">Completed</span>}
              {badge}
              {available && assignment ? <Button asChild size="sm" variant="ghost"><Link href={studentAcademyPath(academySlug, `assignments/${item.assessmentId}`)}>Open assignment</Link></Button>
                : available && <StudentMaterial key={`${item.id}:${unit.access.grantId}`} academyId={academyId} unitId={unit.id} itemId={item.id} title={item.title} expiresAt={item.kind === "answer" ? null : unit.access.expiresAt} />}
            </div>}
        </li>;
      })}
    </ol>}
  </section>;
  return <main className="page-shell">
    <div className="flex items-center border-b pb-3">
      {current ? <Button variant="ghost" className="-ms-2" onClick={() => selectLesson(null)}><HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.5} />Course overview</Button>
        : <Button asChild variant="ghost" className="-ms-2"><Link href={studentListPath(held ? "courses" : "discover")}><HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.5} />{back}</Link></Button>}
    </div>
    <header className="space-y-2">
      <h1 ref={current ? undefined : heading} tabIndex={-1} className="break-words font-heading text-2xl font-semibold tracking-tight outline-none sm:text-4xl">{unit.title}</h1>
      {unit.description && <p className="max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground">{unit.description}</p>}
    </header>
    {current ? <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
      <section aria-labelledby="current-lesson" className="flex min-w-0 flex-col gap-4">
        <div className="overflow-hidden rounded-xl border bg-muted">
          <StudentMaterialViewer key={`${current.id}:${unit.access.grantId}`} academyId={academyId} unitId={unit.id} itemId={current.id} title={current.title} expiresAt={unit.access.expiresAt} />
        </div>
        <div className="space-y-1"><p className="text-xs font-medium text-muted-foreground">Lesson {videos.indexOf(current) + 1} of {videos.length}</p><h2 ref={heading} tabIndex={-1} id="current-lesson" className="break-words font-heading text-xl font-semibold outline-none">{current.title}</h2></div>
      </section>
      {outline}
    </div> : <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,19rem)]">
      {next ? <Card className="gap-3 py-4 sm:py-5 lg:col-start-1">
        <CardContent className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><HugeiconsIcon icon={PlayIcon} strokeWidth={1.5} className="size-4 text-primary" />{resumePosition > 0 ? "Continue learning" : "Up next"}</p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1"><h2 className="break-words font-heading text-lg font-semibold sm:text-2xl">{next.title}</h2>
              <p className="text-sm text-muted-foreground">Video {videos.indexOf(next) + 1} of {videos.length}{minutesRemaining && ` · ${minutesRemaining} min${resumePosition > 0 ? " left" : ""}`}</p>
            </div>
            <Button className="shrink-0" onClick={() => selectLesson(next.id)}>{resumePosition > 0 ? "Resume lesson" : "Start lesson"}</Button>
          </div>
        </CardContent>
      </Card> : showAccessForm ? <Card className="gap-3 py-4 sm:py-5 lg:col-start-1">
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="min-w-0 break-words font-heading text-lg font-semibold sm:text-2xl">{missing ? (missing.kind === "access" ? `Unlock ${missing.unitTitle}` : `Submit ${missing.title}`) : expired ? "Renew access" : "Unlock this unit"}</h2>
            <Badge variant="secondary">{!unit.prerequisitesMet ? "Prerequisite required" : accessLabels[unit.access.status]}</Badge>
          </div>
          {missing && <Button asChild className="w-full sm:w-auto"><Link href={prerequisiteHref(missing.unitId)}>Open prerequisite</Link></Button>}
          {!!unit.prerequisites.length && !unit.prerequisitesMet && <ul className="space-y-2 border-t pt-3 text-sm">{unit.prerequisites.map(requirement => <li key={`${requirement.unitId}:${requirement.kind}:${requirement.assessmentId}`} className="flex items-center justify-between gap-3">
            <Link className="min-w-0 break-words underline underline-offset-4" href={prerequisiteHref(requirement.unitId)}>{requirement.unitTitle} · {requirement.title}</Link><Badge variant="secondary">{requirement.submitted ? (requirement.kind === "access" ? "Unlocked" : "Submitted") : "Required"}</Badge>
          </li>)}</ul>}
          <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); void redeem(); }}>
            <Field className="min-w-0 flex-1"><FieldLabel htmlFor="unit-redemption-code">Coupon</FieldLabel><Input id="unit-redemption-code" value={code} maxLength={100} disabled={busy || !unit.prerequisitesMet} autoComplete="off" autoCapitalize="characters" spellCheck={false} onChange={e => setCode(e.target.value)} /></Field>
            <Button type="submit" aria-label="Redeem coupon" variant={missing ? "outline" : "default"} disabled={busy || !code.trim() || !unit.prerequisitesMet}>{busy && !extending ? "Working…" : "Redeem"}</Button>
          </form>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {expired && <div className="border-t pt-3">
            {unit.extensionAvailable ? <AlertDialog open={extending} onOpenChange={open => {
              if (!busy) { setExtending(open); setExtensionError(""); }
            }}>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="outline" className="h-auto min-h-14 w-full justify-start gap-3 rounded-lg border-border p-2.5 text-start whitespace-normal"
                  aria-label="Use 48-hour extension" aria-describedby="unit-extension-allowance" disabled={busy || !unit.prerequisitesMet}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background text-primary"><HugeiconsIcon icon={Ticket01Icon} strokeWidth={1.5} className="size-[18px]" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><span className="block font-semibold">Use 48-hour extension</span><span id="unit-extension-allowance" className="block text-xs font-normal text-muted-foreground">1 of 1 left this academic year</span></span>
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} className="size-4 text-muted-foreground" aria-hidden="true" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-primary"><HugeiconsIcon icon={Ticket01Icon} strokeWidth={1.5} className="size-[22px]" aria-hidden="true" /></span>
                  <AlertDialogTitle>Use your only extension?</AlertDialogTitle>
                  <AlertDialogDescription>You’ll get 48 more hours on this unit and use your only extension for this academy this academic year.</AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2">
                  <span className="text-sm font-semibold">Extensions left</span>
                  <span aria-hidden="true" className="font-heading text-lg font-semibold tabular-nums">1 → 0</span>
                  <span className="sr-only">From 1 to 0</span>
                </div>
                {extensionError && <p role="alert" className="text-sm text-destructive">{extensionError}</p>}
                <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy || !unit.prerequisitesMet} onClick={e => { e.preventDefault(); void extend(); }}>{busy ? "Activating…" : "Activate extension"}</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog> : <div className="flex min-h-14 items-center gap-3 px-2.5 py-2 text-muted-foreground">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted"><HugeiconsIcon icon={Tick02Icon} strokeWidth={1.5} className="size-[18px]" aria-hidden="true" /></span>
              <div><p className="text-sm font-semibold">48-hour extension used</p><p className="text-xs">0 of 1 left this academic year</p></div>
            </div>}
          </div>}
        </CardContent>
      </Card> : null}
      <Card className="gap-3 py-4 lg:col-start-2 lg:row-start-1 lg:row-span-2">
        <CardHeader><CardTitle>{unit.progress?.total ? "Your progress" : "Unit access"}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <LearningProgress progress={unit.progress} />
          <p className={cn("text-muted-foreground", !!unit.progress?.total && "border-t pt-3")}>
            {unit.access.status === "active" && unit.access.expiresAt ? `Access until ${learningDate(unit.access.expiresAt)}` : !unit.prerequisitesMet ? "Coupon locked until prerequisites are met" : expired && unit.access.expiresAt ? `Access expired · ${learningDate(unit.access.expiresAt)}` : `${accessLabels[unit.access.status]} · ${unit.accessDays} days of access`}
          </p>
          {showAccessForm && unit.couponType && <Badge variant="outline">{unit.couponType}</Badge>}
          {notice && <p role="status">{notice}</p>}
        </CardContent>
      </Card>
      <div className="min-w-0 lg:col-start-1">{outline}</div>
    </div>}
  </main>;
}
