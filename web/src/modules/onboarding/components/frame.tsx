import Link from "next/link";
import { IconSchool } from "@tabler/icons-react";

import { onboardingFrameCopy } from "../copy/frame";
import "../onboarding.css";
import { OnboardingProgressBar } from "./progress-bar";

export function OnboardingFrame({ children, progress, progressLabel = onboardingFrameCopy.academyProgressLabel }: {
  children: React.ReactNode;
  progress?: number;
  progressLabel?: string;
}) {
  return (
    <main className="flex min-h-svh bg-background text-foreground">
      <section className="flex min-h-svh w-full flex-col lg:w-[57%] lg:pl-6">
        <header className="mr-auto flex w-full max-w-[690px] items-center px-5 py-3 sm:px-9 lg:py-7">
          <Link href="/" className="inline-flex items-center gap-2.5 font-semibold tracking-tight" aria-label={onboardingFrameCopy.appHomeLabel}>
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <IconSchool className="size-5" aria-hidden="true" />
            </span>
            <span className="text-lg">{onboardingFrameCopy.brand}</span>
          </Link>
        </header>
        <div className="mr-auto flex w-full max-w-[690px] flex-1 flex-col px-5 pb-6 sm:px-9 lg:pb-8">
          {children}
        </div>
      </section>
      <aside className="onboarding-art-space hidden min-h-svh flex-1 lg:block" aria-hidden="true" />
      {typeof progress === "number" && <OnboardingProgressBar progress={progress} label={progressLabel} />}
    </main>
  );
}
