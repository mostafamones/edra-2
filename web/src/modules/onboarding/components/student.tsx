"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { REGEXP_ONLY_DIGITS } from "input-otp";

import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { PhoneInput } from "@/components/shared/app-input";
import { GLOBAL_LEVELS, type LevelId } from "@/modules/academies";
import { normalizeEgyptianPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import {
  completeStudentProfile,
  getPendingParentChallenge,
  invalidateParentChallenge,
  requestParentCode,
  verifyParentCode,
  type ParentChallenge,
} from "@/modules/students";

import { getParentCodeErrorMessage, studentOnboardingCopy } from "../copy/student";
import { OnboardingContentTransition } from "./content-transition";
import { OnboardingFooter } from "./footer";
import { OnboardingFrame } from "./frame";

export function StudentOnboarding({ initialParentPhone }: { initialParentPhone: string | null }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(initialParentPhone ? 2 : 1);
  const [direction, setDirection] = useState(1);
  const [phone, setPhone] = useState(initialParentPhone ?? "");
  const [verified, setVerified] = useState(Boolean(initialParentPhone));
  const [challenge, setChallenge] = useState<ParentChallenge | null>(null);
  const [code, setCode] = useState("");
  const [levelId, setLevelId] = useState<LevelId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);

  useEffect(() => {
    if (initialParentPhone) return;
    let active = true;
    void getPendingParentChallenge().then((result) => {
      if (!active || !result.ok) return;
      setCooldownUntil(result.value.retryAt);
      if (result.value.challenge) {
        setChallenge(result.value.challenge);
        setPhone(result.value.challenge.phone);
      }
    });
    return () => { active = false; };
  }, [initialParentPhone]);

  useEffect(() => {
    if (!challenge && !cooldownUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [challenge, cooldownUntil]);

  const retryAt = challenge?.retryAt ?? cooldownUntil;
  const resendSeconds = retryAt ? Math.max(0, Math.ceil((Date.parse(retryAt) - now) / 1000)) : 0;

  async function requestCode() {
    const normalized = normalizeEgyptianPhone(phone);
    if (!normalized) {
      setError(studentOnboardingCopy.errors.invalidPhone);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await requestParentCode(normalized);
    setBusy(false);
    if (!result.ok || !result.value?.challenge) {
      setError(getParentCodeErrorMessage(result.ok ? "unavailable" : result.error));
      return;
    }
    setPhone(normalized);
    setCode("");
    setChallenge(result.value.challenge);
    setCooldownUntil(result.value.challenge.retryAt);
    setNow(Date.now());
    setNotice(studentOnboardingCopy.status.codeSent);
  }

  async function changeNumber() {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await invalidateParentChallenge(challenge.id);
    setBusy(false);
    if (!result.ok || !result.value?.invalidated) {
      setError(getParentCodeErrorMessage(result.ok ? "unavailable" : result.error));
      return;
    }
    setCooldownUntil(challenge.retryAt);
    setChallenge(null);
    setCode("");
  }

  async function verifyCode() {
    if (!challenge || code.length !== 6) {
      setError(studentOnboardingCopy.errors.invalidCode);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await verifyParentCode(challenge.id, code);
    setBusy(false);
    if (!result.ok || !result.value?.verified) {
      setError(getParentCodeErrorMessage(result.ok ? "unavailable" : result.error));
      return;
    }
    setChallenge(null);
    setCode("");
    setCooldownUntil(null);
    setVerified(true);
    setNotice(studentOnboardingCopy.status.parentVerified);
  }

  async function finish() {
    if (!levelId) {
      setError(studentOnboardingCopy.errors.chooseLevel);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await completeStudentProfile(levelId);
    if (!result.ok || !result.value?.completed) {
      setBusy(false);
      setError(getParentCodeErrorMessage(result.ok ? "unavailable" : result.error));
      return;
    }
    router.replace("/learn");
    router.refresh();
  }

  function back() {
    setError(null);
    setNotice(null);
    if (step === 1) {
      router.push("/onboarding");
      return;
    }
    setDirection(-1);
    setStep(1);
  }

  function continueToLevel() {
    if (!verified) return;
    setError(null);
    setNotice(null);
    setDirection(1);
    setStep(2);
  }

  const currentScreenCopy = step === 1
    ? studentOnboardingCopy.screens.parentNumber
    : studentOnboardingCopy.screens.level;

  return (
    <OnboardingFrame progress={step / 2} progressLabel={studentOnboardingCopy.progressLabel}>
      <div className="flex flex-1 flex-col">
        <div className="flex-1 py-7 sm:py-9">
          <OnboardingContentTransition>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, x: reduceMotion ? 0 : 20 * direction }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: reduceMotion ? 0 : -20 * direction }}
                transition={{ duration: reduceMotion ? 0 : 0.24, ease: "easeOut" }}
              >
                <div className="mb-8">
                  <h1 className="text-balance text-3xl font-semibold tracking-[-0.045em] sm:text-[2.55rem]">{currentScreenCopy.title}</h1>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
                    {currentScreenCopy.description}
                  </p>
                </div>

                {error && (
                  <p role="alert" className="mb-5 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {error}
                  </p>
                )}

                {step === 1 ? (
                  <div className="space-y-6">
                    {verified ? (
                      <div className="flex items-center gap-3 rounded-xl border border-primary/35 bg-primary/5 px-4 py-4">
                        <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-5" aria-hidden="true" />
                        </span>
                        <div>
                          <p className="font-medium">{studentOnboardingCopy.status.verifiedTitle}</p>
                          <p className="text-sm text-muted-foreground">{studentOnboardingCopy.status.verifiedNumber(phone.slice(-4))}</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-3">
                          <div className="flex items-end gap-2 sm:gap-3">
                            <PhoneInput
                              label={studentOnboardingCopy.phone.label}
                              id="parent-phone"
                              placeholder={studentOnboardingCopy.phone.placeholder}
                              value={phone}
                              onChange={(event) => setPhone(event.target.value)}
                              disabled={busy || Boolean(challenge)}
                              required
                              containerClassName="min-w-0 flex-1"
                            />
                            {!challenge && (
                              <Button type="button" variant="outline" onClick={requestCode} disabled={busy || resendSeconds > 0} className="h-10 min-w-48">
                                {busy ? studentOnboardingCopy.phone.starting : studentOnboardingCopy.phone.start}
                              </Button>
                            )}
                          </div>
                          {!challenge && resendSeconds > 0 && (
                            <p className="text-sm text-muted-foreground">{studentOnboardingCopy.phone.cooldown(resendSeconds)}</p>
                          )}
                        </div>

                        {challenge && (
                          <div className="space-y-1">
                            <div>
                              <p className="text-sm text-muted-foreground">{studentOnboardingCopy.verification.instruction}</p>
                            </div>
                            <div className="flex w-full items-center gap-2 sm:gap-3">
                              <InputOTP
                                id="parent-code"
                                value={code}
                                onChange={setCode}
                                maxLength={6}
                                pattern={REGEXP_ONLY_DIGITS}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                autoFocus
                                aria-label={studentOnboardingCopy.verification.codeLabel}
                                disabled={busy}
                                containerClassName="justify-start"
                              >
                                <InputOTPGroup>
                                  {[0, 1, 2, 3, 4, 5].map((index) => (
                                    <InputOTPSlot key={index} index={index} className="size-8 text-sm sm:size-10 sm:text-base" />
                                  ))}
                                </InputOTPGroup>
                              </InputOTP>
                              <Button type="button" onClick={verifyCode} disabled={busy || code.length !== 6} className="h-10 min-w-0 flex-1 px-2">
                                {busy ? studentOnboardingCopy.verification.verifying : studentOnboardingCopy.verification.verify}
                              </Button>
                            </div>
                            <div className="flex items-center justify-between gap-4 text-sm mt-2">
                              <Button type="button" variant="link" className="h-auto p-0" disabled={busy} onClick={changeNumber}>
                                {studentOnboardingCopy.verification.changeNumber}
                              </Button>
                              <Button type="button" variant="link" className="h-auto p-0" disabled={busy || resendSeconds > 0} onClick={requestCode}>
                                {busy
                                  ? studentOnboardingCopy.verification.sending
                                  : resendSeconds > 0
                                    ? studentOnboardingCopy.verification.resendIn(resendSeconds)
                                    : studentOnboardingCopy.verification.resend}
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2" role="group" aria-label={studentOnboardingCopy.screens.level.groupLabel}>
                    {GLOBAL_LEVELS.map((level) => {
                      const selected = levelId === level.id;
                      return (
                        <motion.div key={level.id} whileTap={reduceMotion ? undefined : { scale: 0.985 }}>
                          <Button
                            type="button"
                            variant="outline"
                            aria-pressed={selected}
                            onClick={() => { setLevelId(level.id); setError(null); }}
                            className={cn(
                              "h-16 w-full justify-between rounded-lg border-border/80 px-4 text-base font-medium",
                              selected && "border-primary bg-primary/8 text-primary ring-1 ring-primary/40",
                            )}
                          >
                            {level.label}
                            <span className={cn("grid size-5 place-items-center rounded border border-border", selected && "border-primary bg-primary text-primary-foreground")}>
                              {selected && <Check className="size-3.5" aria-hidden="true" />}
                            </span>
                          </Button>
                      </motion.div>
                    );
                  })}
                </div>
              )}
              </motion.div>
            </AnimatePresence>
          </OnboardingContentTransition>
        </div>

        <OnboardingFooter
          left={<Button type="button" variant="ghost" onClick={back} className="-ml-2"><ArrowLeft className="size-4" />{studentOnboardingCopy.actions.back}</Button>}
          right={step === 1
            ? <Button type="button" onClick={continueToLevel} disabled={!verified || busy}>{studentOnboardingCopy.actions.continue}<ArrowRight className="size-4" /></Button>
            : <Button type="button" onClick={finish} disabled={busy || !levelId}>{busy ? studentOnboardingCopy.actions.saving : studentOnboardingCopy.actions.finish}<ArrowRight className="size-4" /></Button>}
        />
      </div>
    </OnboardingFrame>
  );
}
