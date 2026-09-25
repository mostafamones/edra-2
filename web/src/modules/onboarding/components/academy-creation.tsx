"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { clearBrowserQueryCache } from "@/lib/query-client";
import { checkAcademySlugAvailability, createAcademySetup } from "@/modules/academies";
import { academySlugSchema } from "@/modules/academies/slug";

import { identityErrors, levelErrors, profileErrors, trackErrors, type AcademyDraft } from "../academy-draft";
import { academyCreationCopy } from "../copy/academy-creation";
import { useAcademyDraft } from "../use-academy-draft";
import { OnboardingContentTransition } from "./content-transition";
import { OnboardingFooter } from "./footer";
import { OnboardingFrame } from "./frame";
import { BasicsStep } from "./steps/basics";
import { ReviewStep } from "./steps/review";
import { LevelsStep } from "./steps/levels";
import { TracksStep } from "./steps/tracks";

const STEPS = academyCreationCopy.steps;

function stepErrors(step: number, draft: AcademyDraft, slugStatus: string | null) {
  if (step === 1) return Object.values(identityErrors(draft));
  if (step === 2) {
    const errors = Object.values(profileErrors(draft));
    if (slugStatus === "taken") errors.push(academyCreationCopy.validation.slugTaken);
    return errors;
  }
  if (step === 3) return levelErrors(draft);
  if (step === 4) return trackErrors(draft);
  return [];
}

export function AcademyCreation({ userId }: { userId: string }) {
  const { draft, ready, update, clear } = useAcademyDraft(userId);
  const copy = academyCreationCopy;
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [returnToReview, setReturnToReview] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [manualSlug, setManualSlug] = useState(false);
  const [customSubject, setCustomSubject] = useState(false);
  const [slugCheck, setSlugCheck] = useState<{
    slug: string;
    status: "available" | "taken" | "unavailable";
  } | null>(null);
  const [serverSlugError, setServerSlugError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();
  const current = STEPS[step - 1];
  const parsedSlug = academySlugSchema.safeParse(draft.slug);
  const slugStatus = !parsedSlug.success
    ? null
    : slugCheck?.slug === parsedSlug.data
      ? slugCheck.status
      : "checking";
  const errors = showErrors ? stepErrors(step, draft, slugStatus) : [];

  useEffect(() => () => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
  }, []);

  useEffect(() => {
    if (!ready || step !== 2) return;
    const parsed = academySlugSchema.safeParse(draft.slug);
    if (!parsed.success) return;

    let active = true;
    const timer = window.setTimeout(async () => {
      const result = await checkAcademySlugAvailability(parsed.data);
      if (active) {
        setSlugCheck({
          slug: parsed.data,
          status: result.status === "invalid" ? "unavailable" : result.status,
        });
      }
    }, 400);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [draft.slug, ready, step]);

  function updateDraft(change: Parameters<typeof update>[0]) {
    update(change);
    setSubmitError(null);
    if (change.slug !== undefined) {
      setServerSlugError(null);
      setSlugCheck(null);
    }
    setShowSaved(true);
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => setShowSaved(false), 1600);
  }

  function moveTo(nextStep: number) {
    setDirection(nextStep > step ? 1 : -1);
    setStep(nextStep);
    setShowErrors(false);
  }

  function next() {
    const nextErrors = stepErrors(step, draft, slugStatus);
    if (nextErrors.length) {
      setShowErrors(true);
      return;
    }
    if (returnToReview && (step === 1 || step === 3)) {
      moveTo(step + 1);
      return;
    }
    moveTo(returnToReview ? STEPS.length : step + 1);
    setReturnToReview(false);
  }

  function back() {
    if (returnToReview) {
      if (step === 2 || step === 4) {
        moveTo(step - 1);
        return;
      }
      moveTo(STEPS.length);
      setReturnToReview(false);
      return;
    }
    moveTo(step - 1);
  }

  function editFromReview(editStep: number) {
    moveTo(editStep);
    setReturnToReview(true);
  }

  async function submit() {
    setIsSubmitting(true);
    setSubmitError(null);
    setServerSlugError(null);
    try {
      const result = await createAcademySetup(draft);
      if (!result.ok) {
        if (result.field === "slug") {
          setServerSlugError(result.code === "slugTaken"
            ? copy.submitErrors.slugTaken
            : copy.validation.slugFormat);
          setReturnToReview(true);
          moveTo(2);
        } else {
          setSubmitError(copy.submitErrors[result.code]);
        }
        return;
      }

      clear();
      clearBrowserQueryCache();
      router.replace("/app");
      router.refresh();
    } catch {
      setSubmitError(copy.submitErrors.saveFailed);
    } finally {
      setIsSubmitting(false);
    }
  }

  const identityFieldErrors = showErrors && step === 1 ? identityErrors(draft) : {};
  const profileFieldErrors = step === 2
    ? {
        ...(showErrors ? profileErrors(draft) : {}),
        ...(slugStatus === "taken" ? { slug: copy.validation.slugTaken } : {}),
        ...(serverSlugError ? { slug: serverSlugError } : {}),
      }
    : {};

  return (
    <OnboardingFrame progress={step / STEPS.length} progressLabel={copy.progressLabel}>
      <div className="flex flex-1 flex-col">
        <OnboardingContentTransition>
          {!ready ? (
            <div className="flex flex-1 flex-col justify-center gap-5" aria-label={copy.loadingDraft}>
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-12 w-2/3" />
              <Skeleton className="h-6 w-4/5" />
              <Skeleton className="mt-8 h-48 w-full" />
            </div>
          ) : (
            <div className="flex flex-1 flex-col">
              <div className="flex-1 py-7 sm:py-9">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: reduceMotion ? 0 : 20 * direction }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: reduceMotion ? 0 : -20 * direction }}
                    transition={{ duration: reduceMotion ? 0 : 0.24, ease: "easeOut" }}
                  >
                    <div className="mb-8">
                      <h1 className="text-balance text-3xl font-semibold tracking-[-0.045em] sm:text-[2.55rem]">{current.title}</h1>
                      <p className="max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">{current.description}</p>
                    </div>

                    {errors.length > 0 && step > 2 && (
                      <div role="alert" className="mb-6 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                        {errors.length === 1 ? <p>{errors[0]}</p> : <ul className="list-disc space-y-1 pl-4">{errors.map((error) => <li key={error}>{error}</li>)}</ul>}
                      </div>
                    )}

                    {submitError && step === 5 && (
                      <div role="alert" className="mb-6 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                        {submitError}
                      </div>
                    )}

                    {step <= 2 && (
                      <BasicsStep
                        section={step === 1 ? "identity" : "profile"}
                        draft={draft}
                        update={updateDraft}
                        errors={step === 1 ? identityFieldErrors : profileFieldErrors}
                        manualSlug={manualSlug}
                        setManualSlug={setManualSlug}
                        customSubject={customSubject}
                        setCustomSubject={setCustomSubject}
                        slugStatus={slugStatus}
                      />
                    )}
                    {step === 3 && <LevelsStep draft={draft} update={updateDraft} />}
                    {step === 4 && <TracksStep draft={draft} update={updateDraft} />}
                    {step === 5 && <ReviewStep draft={draft} edit={editFromReview} />}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          )}
        </OnboardingContentTransition>

        {ready && (
          <OnboardingFooter
            status={(
              <AnimatePresence>
                {showSaved && (
                  <motion.p
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: reduceMotion ? 0 : 0.16 }}
                    aria-live="polite"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <Check className="size-3.5" />{copy.actions.saved}
                  </motion.p>
                )}
              </AnimatePresence>
            )}
            left={step === 1 && !returnToReview ? (
              <Button variant="ghost" asChild className="-ml-2"><Link href="/onboarding"><ArrowLeft className="size-4" />{copy.actions.back}</Link></Button>
            ) : (
              <Button variant="ghost" onClick={back} className="-ml-2"><ArrowLeft className="size-4" />{returnToReview && (step === 1 || step === 3) ? copy.actions.review : copy.actions.back}</Button>
            )}
            right={step < STEPS.length ? (
              <Button size="lg" onClick={next} disabled={step === 2 && slugStatus === "checking"} className="h-11 rounded-lg px-4">{returnToReview && step !== 1 && step !== 3 ? copy.actions.returnToReview : copy.actions.continue}<ArrowRight className="size-4" /></Button>
            ) : (
              <Button size="lg" onClick={submit} disabled={isSubmitting} aria-busy={isSubmitting} className="h-11 rounded-lg px-4">
                {isSubmitting ? <LoaderCircle className={reduceMotion ? "size-4" : "size-4 animate-spin"} /> : null}
                {isSubmitting ? copy.actions.creating : copy.actions.create}
              </Button>
            )}
          />
        )}
      </div>
    </OnboardingFrame>
  );
}
