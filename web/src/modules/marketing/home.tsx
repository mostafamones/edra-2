import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Task01Icon } from "@hugeicons/core-free-icons";
import { IconArrowDown, IconArrowRight, IconPlus, IconSchool } from "@/components/shared/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { SheetEntry } from "@/modules/attendance";
import { HomeView } from "@/modules/home";
import { LearningHome } from "@/modules/learning";
import { ResultsChart, StudentAttendance, StudentFacts } from "@/modules/students";
import { AppFrame } from "./frame";
import { SampleRegister } from "./register";
import { academy, learning, live, mariamId, overview, pastAttendance, results, sessionStartedAt, settled, student } from "./sample";

const container = "mx-auto w-full max-w-[76rem] px-4 sm:px-8 lg:px-10";
const sectionTitle = "text-balance font-heading text-[clamp(2rem,4.6vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.045em]";
const lead = "max-w-[46ch] text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg";
const navLink = "rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4";
const sections = [["register", "Attendance"], ["record", "Records"], ["students", "Students"], ["questions", "FAQ"]] as const;

const questions = [
  { question: "Can I teach in person and online in the same academy?", answer: "Yes. Edra supports classroom, online and hybrid students, with attendance and results kept on the same student record." },
  { question: "Can I add students before they have an account?", answer: "Yes. Staff can add students and record attendance and marks before the students join online." },
  { question: "Can students join my academy with a link?", answer: "Yes. Share your academy’s student invite link for online access. Enrollment can also use a booking link when bookings are open." },
  { question: "Is the app on this page real?", answer: "Yes. Every screen here is Edra’s own interface, filled with a fictional academy. Nothing you do on this page is saved." },
];

export function MarketingHome({ isSignedIn, primaryHref, signInHref }: {
  isSignedIn: boolean;
  primaryHref: string;
  signInHref: string;
}) {
  const primaryLabel = isSignedIn ? "Go to app" : "Get started";
  const [taken, setTaken] = useState<SheetEntry | null>(null);
  const attendance = taken?.publishedStatus
    ? [{ session_id: "today", session_started_at: sessionStartedAt, status: taken.publishedStatus, mandatory: true }, ...pastAttendance]
    : pastAttendance;

  return (
    <div id="top" className="min-h-screen overflow-x-clip bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
        <div className={`${container} flex h-16 items-center justify-between gap-4`}>
          <a href="#top" aria-label="Edra home" className="flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><IconSchool className="size-5" aria-hidden="true" /></span>
            <span className="font-heading text-xl font-semibold tracking-tight">Edra</span>
          </a>
          <nav aria-label="Main navigation" className="hidden items-center gap-7 text-sm md:flex">
            {sections.map(([id, label]) => <a key={id} className={navLink} href={`#${id}`}>{label}</a>)}
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            {!isSignedIn && <Button asChild variant="ghost"><a href={signInHref}>Sign in</a></Button>}
            <Button asChild><a href={primaryHref}>{primaryLabel}</a></Button>
          </div>
        </div>
      </header>

      <main>
        <section aria-labelledby="home-heading" className="relative isolate pb-16 pt-14 sm:pb-24 sm:pt-20">
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(color-mix(in_oklab,var(--foreground)_12%,transparent)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black,transparent)]" />
          <div aria-hidden="true" className="absolute left-1/2 top-[38%] -z-10 h-[32rem] w-[60rem] max-w-[150vw] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
          <div className={`${container} text-center`}>
            <Badge variant="outline" className="mb-6 gap-2 rounded-full bg-background px-3 py-1 text-xs">
              <span className="size-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" aria-hidden="true" />Not a screenshot
            </Badge>
            <h1 id="home-heading" className="mx-auto max-w-[15ch] text-balance font-heading text-[clamp(2.5rem,7.5vw,5.5rem)] font-semibold leading-[0.98] tracking-[-0.055em]">
              Your academy, already running.
            </h1>
            <p className={`${lead} mx-auto mt-6`}>
              Every screen on this page is Edra itself, running a sample academy. Scroll down and take a class register.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" className="h-11 gap-2 rounded-full px-5"><a href={primaryHref}>{primaryLabel}<IconArrowRight aria-hidden="true" /></a></Button>
              <Button asChild size="lg" variant="outline" className="group h-11 gap-2 rounded-full bg-background px-5">
                <a href="#register">Take the register<IconArrowDown className="motion-safe:transition-transform motion-safe:group-hover:translate-y-0.5" aria-hidden="true" /></a>
              </Button>
            </div>
          </div>
          <div className={`${container} mt-14 sm:mt-20`}>
            <AppFrame label={`${academy.name} · Home`} className="relative mx-auto max-w-6xl [&>div:last-child]:max-h-[38rem] [&>div:last-child]:overflow-hidden [&>div:last-child]:[mask-image:linear-gradient(black_75%,transparent)] sm:[&>div:last-child]:max-h-[44rem]">
              <div className="p-4 sm:p-8">
                <HomeView academyName={academy.name} base="/app" overview={settled(overview)} live={settled(live)} />
              </div>
            </AppFrame>
          </div>
        </section>

        <section id="register" aria-labelledby="register-heading" className="scroll-mt-16 border-y bg-muted/40 py-16 sm:py-24">
          <div className={container}>
            <div className="mb-10 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <h2 id="register-heading" className={sectionTitle}>Go on. Take the register.</h2>
              <p className={`${lead} md:max-w-[30ch] md:text-right`}>Mark a few students, finalize, then keep scrolling.</p>
            </div>
            <SampleRegister onFinalize={entries => setTaken(entries.find(entry => entry.annualStudentRecordId === mariamId) ?? null)} />
          </div>
        </section>

        <section id="record" aria-labelledby="record-heading" className="scroll-mt-16 py-16 sm:py-24">
          <div className={container}>
            <div aria-live="polite" className="mb-10">
              <h2 id="record-heading" className={`${sectionTitle} max-w-[20ch]`}>
                {taken ? "Mariam’s record already has today’s class." : "Every class lands on the student’s record."}
              </h2>
            </div>
            <AppFrame label={`${academy.name} · Students · ${student.fullName}`}>
              <article className="page-shell p-4 sm:p-8" aria-label="Student record">
                <header className="space-y-2">
                  <h3 className="text-2xl font-semibold tracking-tight">{student.fullName}</h3>
                  <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">Active</Badge><Badge variant="secondary">In person</Badge><span className="text-xs text-muted-foreground">Account connected</span></div>
                </header>
                <StudentFacts student={student} grade="Grade 10" track="Mathematics" group="Group A" />
                <div key={attendance.length} className="rounded-xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-[0.98] motion-safe:duration-500">
                  <StudentAttendance query={settled(attendance) as unknown as Parameters<typeof StudentAttendance>[0]["query"]} base="/app" />
                </div>
                <Card className="gap-0 py-0 shadow-none">
                  <div className="flex items-center gap-2 border-b p-4 sm:px-5"><HugeiconsIcon icon={Task01Icon} size={18} strokeWidth={1.5} aria-hidden="true" /><h4 className="flex-1 text-base font-semibold">Assessments</h4></div>
                  <div className="p-4 sm:p-5"><ResultsChart items={results} base="/app" /></div>
                </Card>
              </article>
            </AppFrame>
          </div>
        </section>

        <section id="students" aria-labelledby="students-heading" className="scroll-mt-16 border-y bg-muted/40 py-16 sm:py-24">
          <div className={`${container} grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-20`}>
            <div>
              <h2 id="students-heading" className={sectionTitle}>Students get a home of their own.</h2>
              <p className={`${lead} mt-6`}>Lessons to continue, work that’s due and exams coming up, across every academy they join.</p>
            </div>
            <AppFrame label="Student · Home" className="mx-auto w-full max-w-[26rem] rounded-[2rem]">
              <div className="p-4 sm:p-6"><LearningHome data={learning} /></div>
            </AppFrame>
          </div>
        </section>

        <section id="questions" aria-labelledby="questions-heading" className="scroll-mt-16 py-16 sm:py-24">
          <div className={`${container} grid items-start gap-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] md:gap-12`}>
            <h2 id="questions-heading" className={sectionTitle}>Before you start</h2>
            <div className="divide-y border-y">
              {questions.map(({ question, answer }) => (
                <Collapsible key={question}>
                  <h3 className="font-sans">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="group h-auto min-h-14 w-full justify-between gap-3 whitespace-normal px-2 py-4 text-left text-base hover:bg-muted/60">
                        {question}
                        <IconPlus className="size-4 shrink-0 text-muted-foreground group-aria-expanded:rotate-45 motion-safe:transition-transform" aria-hidden="true" />
                      </Button>
                    </CollapsibleTrigger>
                  </h3>
                  <CollapsibleContent className="max-w-[61ch] px-2 pb-4 leading-relaxed text-muted-foreground">{answer}</CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="start-heading" className="relative isolate overflow-hidden bg-primary py-20 text-center text-primary-foreground sm:py-28">
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(currentColor_1px,transparent_1px)] opacity-15 [background-size:22px_22px] [mask-image:radial-gradient(ellipse_60%_80%_at_50%_100%,black,transparent)]" />
          <h2 id="start-heading" className={`${sectionTitle} px-4`}>Now do it with your own students.</h2>
          <Button asChild size="lg" variant="secondary" className="mt-8 h-11 gap-2 rounded-full px-5">
            <a href={primaryHref}>{primaryLabel}<IconArrowRight aria-hidden="true" /></a>
          </Button>
        </section>
      </main>

      <footer className="border-t">
        <div className={`${container} flex flex-wrap items-center justify-between gap-4 py-6`}>
          <a href="#top" className="rounded-sm font-heading text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4">Edra</a>
          <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
            {sections.map(([id, label]) => <a key={id} className={navLink} href={`#${id}`}>{label}</a>)}
          </nav>
        </div>
      </footer>
    </div>
  );
}
