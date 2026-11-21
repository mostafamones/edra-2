import { useState } from "react";
import { IconArrowRight, IconPlus, IconSchool } from "@/components/shared/icons";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MarketingCapabilities } from "./capabilities";
import { MarketingHero } from "./hero";
import { WorkflowPreview, type WorkflowStep } from "./workflow";

const container = "mx-auto w-full max-w-[76rem] px-5 sm:px-8 lg:px-10";
const sectionTitle = "text-balance text-[clamp(1.9rem,4vw,3.375rem)] font-medium leading-[1.12] tracking-[-0.055em]";

const walkthrough = {
  attendance: {
    title: "Take attendance as students arrive",
    detail: "Try marking a student in the roster. In Edra, staff can review attendance before finalizing it.",
  },
  lessons: {
    title: "Give students a place to revisit the lesson",
    detail: "Group the explanation, practice assignment, and quiz into one unit students can open online.",
  },
  results: {
    title: "Give students a clear view of their marks",
    detail: "Announced results appear for students alongside their other classroom and online work.",
  },
};

const questions = [
  {
    question: "Can I teach in person and online in the same academy?",
    answer: "Yes. Edra supports classroom, online, and hybrid participation, with attendance and results kept on the same student record.",
  },
  {
    question: "Can I add students before they have an account?",
    answer: "Yes. Staff can add students and record attendance and marks before the students join the online academy.",
  },
  {
    question: "Can students join my academy with a link?",
    answer: "Yes. Share your academy’s student invite link for online access. Enrollment can also use a booking link when bookings are open.",
  },
];

export function MarketingHome({ isSignedIn, primaryHref, signInHref }: {
  isSignedIn: boolean;
  primaryHref: string;
  signInHref: string;
}) {
  const primaryLabel = isSignedIn ? "Go to app" : "Get started";
  const [activeStep, setActiveStep] = useState<WorkflowStep>("attendance");
  const currentStep = walkthrough[activeStep];

  return (
    <div id="top" className="min-h-screen bg-background text-foreground">
      <div className="dark bg-[#101611] text-[#f6faf6]">
        <header className="border-b border-white/10">
          <div className={`${container} grid min-h-[4.5rem] grid-cols-[auto_1fr] items-center gap-2 py-3 md:grid-cols-[1fr_auto_1fr]`}>
            <a href="#top" aria-label="Edra home" className="flex w-fit items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-300/15 text-emerald-300">
                <IconSchool className="size-5" aria-hidden="true" />
              </span>
              <span className="font-heading text-xl font-semibold tracking-tight">Edra</span>
            </a>
            <nav aria-label="Main navigation" className="hidden items-center gap-7 text-sm text-zinc-300 md:flex">
              <a className="rounded-sm hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4" href="#workflow">How it works</a>
              <a className="rounded-sm hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4" href="#features">Features</a>
              <a className="rounded-sm hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4" href="#questions">FAQ</a>
            </nav>
            <div className="flex justify-end gap-1 sm:gap-2">
              {!isSignedIn && (
                <Button asChild variant="ghost" className="px-2.5 sm:px-3">
                  <a href={signInHref}>Sign in</a>
                </Button>
              )}
              <Button asChild className="rounded-full bg-emerald-300 px-3.5 text-emerald-950 hover:bg-emerald-200 sm:px-4">
                <a href={primaryHref}>{primaryLabel}</a>
              </Button>
            </div>
          </div>
        </header>
      </div>

      <main>
        <div className="dark bg-[#101611] text-[#f6faf6]">
          <MarketingHero primaryHref={primaryHref} primaryLabel={primaryLabel} onExplore={setActiveStep} />
        </div>

        <section id="workflow" aria-labelledby="workflow-heading" className="scroll-mt-6 border-b bg-primary/[0.045] py-16 sm:py-24 dark:bg-primary/[0.08]">
          <div className={`${container} grid items-center gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)] lg:gap-16`}>
            <div>
              <h2 id="workflow-heading" className={sectionTitle}>Follow a class from check-in to results.</h2>
              <div key={activeStep} className="mt-6 min-h-24 border-l-2 border-emerald-600 pl-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 dark:border-emerald-400">
                <h3 className="font-sans text-base font-semibold">{currentStep.title}</h3>
                <p className="mt-2 max-w-[40ch] leading-relaxed text-foreground/75">{currentStep.detail}</p>
              </div>
            </div>
            <WorkflowPreview activeStep={activeStep} onStepChange={setActiveStep} />
          </div>
        </section>

        <section id="features" aria-labelledby="features-heading" className={`${container} scroll-mt-6 py-16 sm:py-24`}>
          <h2 id="features-heading" className={`mb-8 max-w-[21ch] sm:mb-10 ${sectionTitle}`}>What you can run with Edra.</h2>
          <MarketingCapabilities />
        </section>

        <section id="questions" aria-labelledby="questions-heading" className="scroll-mt-6 border-y bg-muted/35 py-16 sm:py-20">
          <div className={`${container} grid items-start gap-7 md:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)] md:gap-12`}>
            <h2 id="questions-heading" className={sectionTitle}>Before you get started</h2>
            <div className="divide-y border-y">
              {questions.map(({ question, answer }) => (
                <Collapsible key={question}>
                  <h3 className="font-sans">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="group h-auto min-h-14 w-full justify-between gap-3 whitespace-normal px-2 py-4 text-left text-base hover:bg-muted/60 motion-reduce:transition-none">
                        {question}
                        <IconPlus className="size-4 text-muted-foreground group-aria-expanded:rotate-45 motion-safe:transition-transform" aria-hidden="true" />
                      </Button>
                    </CollapsibleTrigger>
                  </h3>
                  <CollapsibleContent className="max-w-[61ch] px-2 pb-4 leading-relaxed text-foreground/75">
                    {answer}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="start-heading" className="dark relative isolate overflow-hidden bg-[#101611] px-5 py-16 text-center text-[#f6faf6] sm:py-24">
          <div aria-hidden="true" className="pointer-events-none absolute -inset-x-20 bottom-0 -z-10 h-full bg-[radial-gradient(ellipse_at_50%_100%,#164532_0%,transparent_65%)]" />
          <h2 id="start-heading" className={sectionTitle}>Set up your academy.</h2>
          <Button asChild size="lg" className="mt-6 h-11 gap-2 rounded-full bg-emerald-300 px-5 text-emerald-950 hover:bg-emerald-200">
            <a href={primaryHref}>{primaryLabel}<IconArrowRight aria-hidden="true" /></a>
          </Button>
        </section>
      </main>

      <footer className="dark border-t border-white/10 bg-[#101611] text-[#f6faf6]">
        <div className={`${container} flex flex-wrap items-center justify-between gap-4 py-6`}>
          <a href="#top" className="rounded-sm font-heading text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4">Edra</a>
          <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-zinc-300">
            <a className="rounded-sm hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4" href="#workflow">How it works</a>
            <a className="rounded-sm hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4" href="#features">Features</a>
            <a className="rounded-sm hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4" href="#questions">FAQ</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
