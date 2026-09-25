"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Building2, GraduationCap, UserRound, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";

import { roleChoiceCopy } from "../copy/role-choice";
import { OnboardingContentTransition } from "./content-transition";
import { OnboardingFooter } from "./footer";
import { OnboardingFrame } from "./frame";

export function RoleChoice({ initialScreen = "role" }: { initialScreen?: "role" | "instructor" }) {
  const [screen, setScreen] = useState<"role" | "instructor">(initialScreen);
  const reduceMotion = useReducedMotion();
  const currentCopy = roleChoiceCopy.screens[screen];

  return (
    <OnboardingFrame>
      <OnboardingContentTransition>
        <div className="flex flex-1 flex-col justify-center py-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={screen}
              initial={{ opacity: 0, x: reduceMotion ? 0 : 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: reduceMotion ? 0 : -16 }}
              transition={{ duration: reduceMotion ? 0 : 0.22 }}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{roleChoiceCopy.eyebrow}</p>
              <h1 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
                {currentCopy.title}
              </h1>
              <p className="mt-4 max-w-lg text-base leading-2 text-muted-foreground">
                {currentCopy.description}
              </p>

              <div className="mt-10 grid gap-3">
                {screen === "role" ? (
                  <>
                    <Button asChild variant="outline" className="h-auto w-full justify-between rounded-xl border-border/80 px-5 py-5 text-left hover:border-primary/45 hover:bg-primary/5">
                      <Link href="/onboarding/student">
                        <span className="flex items-center gap-4">
                          <span className="grid size-11 place-items-center rounded-lg bg-primary/10 text-primary"><GraduationCap className="size-5" /></span>
                          <span><span className="block text-base font-semibold">{roleChoiceCopy.screens.role.options.student.title}</span><span className="mt-1 block text-sm font-normal text-muted-foreground">{roleChoiceCopy.screens.role.options.student.description}</span></span>
                        </span>
                        <ArrowRight className="size-5 text-muted-foreground" />
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setScreen("instructor")}
                      className="h-auto w-full justify-between rounded-xl border-border/80 px-5 py-5 text-left hover:border-primary/45 hover:bg-primary/5"
                    >
                      <span className="flex items-center gap-4">
                        <span className="grid size-11 place-items-center rounded-lg bg-primary/10 text-primary"><UserRound className="size-5" /></span>
                        <span><span className="block text-base font-semibold">{roleChoiceCopy.screens.role.options.instructor.title}</span><span className="mt-1 block text-sm font-normal text-muted-foreground">{roleChoiceCopy.screens.role.options.instructor.description}</span></span>
                      </span>
                      <ArrowRight className="size-5 text-muted-foreground" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button asChild variant="outline" className="h-auto w-full justify-between rounded-xl border-border/80 px-5 py-5 text-left hover:border-primary/45 hover:bg-primary/5">
                      <Link href="/onboarding/instructor/join">
                        <span className="flex items-center gap-4">
                          <span className="grid size-11 place-items-center rounded-lg bg-primary/10 text-primary"><UsersRound className="size-5" /></span>
                          <span><span className="block text-base font-semibold">{roleChoiceCopy.screens.instructor.options.join.title}</span><span className="mt-1 block text-sm font-normal text-muted-foreground">{roleChoiceCopy.screens.instructor.options.join.description}</span></span>
                        </span>
                        <ArrowRight className="size-5 text-muted-foreground" />
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="h-auto w-full justify-between rounded-xl border-border/80 px-5 py-5 text-left hover:border-primary/45 hover:bg-primary/5">
                      <Link href="/onboarding/academy/create">
                        <span className="flex items-center gap-4">
                          <span className="grid size-11 place-items-center rounded-lg bg-primary/10 text-primary"><Building2 className="size-5" /></span>
                          <span><span className="block text-base font-semibold">{roleChoiceCopy.screens.instructor.options.owner.title}</span><span className="mt-1 block text-sm font-normal text-muted-foreground">{roleChoiceCopy.screens.instructor.options.owner.description}</span></span>
                        </span>
                        <ArrowRight className="size-5 text-muted-foreground" />
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </OnboardingContentTransition>
      <OnboardingFooter
        left={screen === "instructor" ? (
          <Button variant="ghost" onClick={() => setScreen("role")} className="-ml-2"><ArrowLeft className="size-4" />{roleChoiceCopy.footer.back}</Button>
        ) : (
          <Button variant="ghost" asChild className="-ml-2"><Link href="/app"><ArrowLeft className="size-4" />{roleChoiceCopy.footer.appHome}</Link></Button>
        )}
        right={<span className="text-xs text-muted-foreground">{roleChoiceCopy.footer.tagline}</span>}
      />
    </OnboardingFrame>
  );
}
