import { useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon, AssignmentsIcon, BubbleChatIcon, CheckmarkCircle02Icon, FolderLibraryIcon, QrCodeIcon, SmartPhone01Icon, StudentsIcon, Task01Icon, TeachingIcon,
  ChartLineData01Icon,
} from "@hugeicons/core-free-icons";
import { IconPlus } from "@/components/shared/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import type { SheetEntry } from "@/modules/attendance";
import { LearningHome } from "@/modules/learning";
import { ResultsChart, StudentAttendance, StudentFacts } from "@/modules/students";
import { cn } from "@/lib/utils";
import { tools } from "./catalog";
import { MarketingFooter } from "./footer";
import { AppFrame } from "./frame";
import { MarketingNav, type NavProps } from "./nav";
import { SampleRegister } from "./register";
import { Reveal } from "./reveal";
import { academy, learning, mariamId, pastAttendance, results, sessionStartedAt, settled, student } from "./sample";

const container = "mx-auto w-full max-w-[76rem] px-4 sm:px-8 lg:px-10";
const title = "text-balance font-heading text-[clamp(2rem,4.4vw,3.4rem)] font-semibold leading-[1.04] tracking-[-0.045em]";
const lead = "max-w-[44ch] text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg";

const questions = [
  { question: "Can I teach in person and online in the same academy?", answer: "Yes. Edra supports classroom, online and hybrid students, with attendance and results kept on the same student record." },
  { question: "Can I add students before they have an account?", answer: "Yes. Staff can add or import students and record attendance and marks before the students join online." },
  { question: "Which features are marked “Soon”?", answer: "They are planned and specified, and are being built now. Everything else on this page works in Edra today." },
  { question: "Is the app on this page real?", answer: "Yes. The screens are Edra’s own interface filled with a fictional academy. Nothing you do on this page is saved." },
];

function Feature({ id, icon, label, soon, heading, body, points, children, flip }: {
  id: string; icon: typeof StudentsIcon; label: string; soon?: boolean; heading: string; body: string; points: string[]; children: ReactNode; flip?: boolean;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-20 py-16 sm:py-24">
      <div className={cn(container, "grid items-center gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16")}>
        <Reveal className={cn(flip && "lg:order-2")}>
          <p className="mb-4 flex items-center gap-2 text-sm font-medium text-primary">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10"><HugeiconsIcon icon={icon} size={18} strokeWidth={1.5} aria-hidden="true" /></span>
            {label}{soon && <Badge variant="outline">Soon</Badge>}
          </p>
          <h2 id={`${id}-heading`} className={title}>{heading}</h2>
          <p className={cn(lead, "mt-5")}>{body}</p>
          <ul className="mt-6 space-y-2.5">
            {points.map(point => <li key={point} className="flex gap-2.5 text-sm"><HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} strokeWidth={1.5} className="shrink-0 text-primary" aria-hidden="true" />{point}</li>)}
          </ul>
        </Reveal>
        <Reveal delay={120} className="min-w-0">{children}</Reveal>
      </div>
    </section>
  );
}

export function MarketingHome(props: NavProps) {
  const { isSignedIn, primaryHref } = props;
  const primaryLabel = isSignedIn ? "Go to app" : "Get started";
  const [taken, setTaken] = useState<SheetEntry | null>(null);
  const attendance = taken?.publishedStatus
    ? [{ session_id: "today", session_started_at: sessionStartedAt, status: taken.publishedStatus, mandatory: true }, ...pastAttendance]
    : pastAttendance;

  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      <MarketingNav {...props} />
      <main>
        <section aria-labelledby="home-heading" className="relative isolate pb-10 pt-14 sm:pt-20">
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(color-mix(in_oklab,var(--foreground)_12%,transparent)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_25%,black,transparent)]" />
          <div aria-hidden="true" className="absolute left-1/2 top-[45%] -z-10 h-[34rem] w-[64rem] max-w-[160vw] -translate-x-1/2 rounded-full bg-primary/20 blur-[130px] motion-safe:animate-pulse motion-safe:[animation-duration:6s]" />
          <div className={cn(container, "text-center")}>
            <h1 id="home-heading" className="mx-auto font-heading text-[clamp(2rem,7.4vw,5.75rem)] font-semibold leading-[0.96] tracking-[-0.055em] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700">
              <span className="block">Your whole academy.</span> <span className="block bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">One place.</span>
            </h1>
            <p className={cn(lead, "mx-auto mt-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:delay-100 motion-safe:duration-700 motion-safe:fill-mode-both")}>
              Students, classes, attendance, lessons, exams and results, on the web and in your pocket.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:delay-200 motion-safe:duration-700 motion-safe:fill-mode-both">
              <Button asChild size="lg" className="group/cta h-11 gap-2 rounded-full px-6 shadow-lg shadow-primary/25">
                <a href={primaryHref}>{primaryLabel}<HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} className="transition-transform group-hover/cta:translate-x-1" aria-hidden="true" /></a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 rounded-full bg-background/80 px-6"><a href="/pricing">See pricing</a></Button>
            </div>
          </div>
          <div className={cn(container, "mt-8 [perspective:2400px] sm:mt-12 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-12 motion-safe:delay-300 motion-safe:duration-1000 motion-safe:fill-mode-both")}>
            <figure aria-label="Students" className="group/window relative mx-auto max-w-6xl overflow-hidden rounded-2xl border bg-sidebar shadow-2xl shadow-primary/15 transition-transform duration-700 ease-out motion-safe:lg:[transform:rotateX(9deg)_scale(0.97)] motion-safe:lg:hover:[transform:none]">
              <div className="flex h-10 items-center gap-3 border-b px-4" aria-hidden="true">
                <span className="flex gap-1.5">{["bg-red-400/70", "bg-amber-400/70", "bg-green-500/70"].map(color => <span key={color} className={cn("size-2.5 rounded-full", color)} />)}</span>
                <span className="mx-auto rounded-md bg-muted/60 px-10 py-0.5 text-xs text-muted-foreground">app.edra · Students</span>
              </div>
              <img src="/marketing/students.webp" width={2304} height={1350} fetchPriority="high" alt="Edra's Students page: a sidebar of academy sections beside a searchable table of students with their phones, levels, groups and labels." className="block h-auto w-full" />
            </figure>
          </div>
        </section>

        <Feature id="students" icon={StudentsIcon} label="Students & records" heading="Every student, one living record."
          body="Placement, contacts, attendance and results come together on one page, before and after a student goes online."
          points={["Import a whole roster from a spreadsheet", "Groups, levels, tracks and labels", "Student codes, invite links and bookings"]}>
          <AppFrame label={`${academy.name} · Students · ${student.fullName}`}>
            <article className="page-shell p-4 sm:p-6" aria-label="Student record">
              <header className="space-y-2">
                <h3 className="text-2xl font-semibold tracking-tight">{student.fullName}</h3>
                <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">Active</Badge><Badge variant="secondary">In person</Badge><span className="text-xs text-muted-foreground">Account connected</span></div>
              </header>
              <StudentFacts student={student} grade="Grade 10" track="Mathematics" group="Group A" />
              <div key={attendance.length} className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-[0.98] motion-safe:duration-500">
                <StudentAttendance query={settled(attendance) as unknown as Parameters<typeof StudentAttendance>[0]["query"]} base="/app" />
              </div>
            </article>
          </AppFrame>
        </Feature>

        <section id="attendance" aria-labelledby="attendance-heading" className="scroll-mt-20 border-y bg-muted/40 py-16 sm:py-24">
          <div className={container}>
            <Reveal className="mb-10 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <p className="mb-4 flex items-center gap-2 text-sm font-medium text-primary"><span className="grid size-8 place-items-center rounded-lg bg-primary/10"><HugeiconsIcon icon={TeachingIcon} size={18} strokeWidth={1.5} aria-hidden="true" /></span>Sessions & attendance</p>
                <h2 id="attendance-heading" className={title}>Take the register. Really, try it.</h2>
              </div>
              <p className={cn(lead, "md:max-w-[32ch] md:text-right")}>{taken ? "Done. Scroll up: Mariam’s record already has today’s class." : "Mark a few students and finalize. Then check Mariam’s record above."}</p>
            </Reveal>
            <Reveal delay={100}><SampleRegister onFinalize={entries => setTaken(entries.find(entry => entry.annualStudentRecordId === mariamId) ?? null)} /></Reveal>
          </div>
        </section>

        <Feature id="learning" icon={FolderLibraryIcon} label="Lessons & content" flip heading="Lessons students can actually find."
          body="Build units from videos, files and practice, release them when you are ready, and students see exactly what to do next."
          points={["Scheduled releases with saved versions", "Prerequisites, access periods and coupons", "Video playback with answer videos"]}>
          <AppFrame label="Student · Home" className="mx-auto w-full max-w-[25rem] rounded-[2rem]">
            <div className="p-4 sm:p-6"><LearningHome data={learning} /></div>
          </AppFrame>
        </Feature>

        <Feature id="assessments" icon={AssignmentsIcon} label="Assignments, quizzes & exams" heading="Mark once. Announce when it’s right."
          body="Online or on paper, every assessment is marked in one place and results reach students only when you announce them."
          points={["Written work uploads and part-by-part scoring", "Timed, fullscreen exams with recovery", "Question bank shared across assessments"]}>
          <Card className="gap-0 py-0 shadow-xl shadow-primary/5">
            <div className="flex items-center gap-2 border-b p-4 sm:px-5"><HugeiconsIcon icon={Task01Icon} size={18} strokeWidth={1.5} aria-hidden="true" /><h3 className="flex-1 text-base font-semibold">Assessments · {student.fullName}</h3></div>
            <div className="p-4 sm:p-5"><ResultsChart items={results} base="/app" /></div>
          </Card>
        </Feature>

        <Feature id="family" icon={ChartLineData01Icon} label="Parents & reports" soon flip heading="Parents stay in the loop, automatically."
          body="Attendance and results turn into clear reports for families, with messages and notes kept beside each student."
          points={["Parent reports from finalized attendance and announced results", "Messages to parents by student or group", "Academic notes and concern threads for staff"]}>
          <div className="relative mx-auto max-w-md">
            <Card className="gap-4 p-5 shadow-xl shadow-primary/10 transition-transform duration-500 hover:-rotate-1 motion-reduce:transition-none" aria-label="Sample parent report">
              <div className="flex items-center justify-between gap-2"><span className="font-heading text-lg font-semibold">November report</span><Badge variant="secondary">{student.fullName}</Badge></div>
              {[["Attendance", 91], ["Assignments", 79], ["Quizzes", 80]].map(([label, value]) => (
                <div key={label} className="space-y-1.5"><div className="flex justify-between text-sm"><span>{label}</span><span className="tabular-nums text-muted-foreground">{value}%</span></div><Progress value={Number(value)} aria-label={`${label} ${value}%`} /></div>
              ))}
            </Card>
            <Card size="sm" className="absolute -bottom-10 -right-2 w-64 gap-1.5 px-4 shadow-lg sm:-right-10 motion-safe:animate-bounce motion-safe:[animation-duration:4s]" aria-label="Sample parent message">
              <span className="flex items-center gap-2 text-xs font-medium text-primary"><HugeiconsIcon icon={BubbleChatIcon} size={14} strokeWidth={1.5} aria-hidden="true" />Message to parents</span>
              <span className="text-xs text-muted-foreground">Mariam scored 18/20 on Quadratic equations. Great progress this month.</span>
            </Card>
          </div>
        </Feature>

        <section id="mobile" aria-labelledby="mobile-heading" className="dark relative isolate scroll-mt-16 overflow-hidden bg-background py-16 text-foreground sm:py-24">
          <div aria-hidden="true" className="absolute -right-40 top-0 -z-10 size-[40rem] rounded-full bg-primary/25 blur-[140px]" />
          <div className={cn(container, "grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-20")}>
            <Reveal>
              <p className="mb-4 flex items-center gap-2 text-sm font-medium text-primary"><span className="grid size-8 place-items-center rounded-lg bg-primary/15"><HugeiconsIcon icon={SmartPhone01Icon} size={18} strokeWidth={1.5} aria-hidden="true" /></span>Mobile</p>
              <h2 id="mobile-heading" className={title}>Teach with your phone in hand.</h2>
              <p className={cn(lead, "mt-5")}>The instructor companion runs live sessions, checks students in with their code and marks paper work, right in the classroom.</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {[["iPhone", "Available", false], ["Android", "Soon", true], ["Notifications", "Soon", true], ["Concern threads", "Soon", true]].map(([name, state, soon]) => (
                  <Card key={String(name)} size="sm" className="flex-row items-center justify-between px-4 shadow-none"><span className="text-sm font-medium">{name}</span><Badge variant={soon ? "outline" : "default"}>{state}</Badge></Card>
                ))}
              </div>
            </Reveal>
            <Reveal delay={150} className="mx-auto">
              <div className="relative w-[17rem] rounded-[2.75rem] border-[10px] border-neutral-800 bg-card p-4 shadow-2xl shadow-primary/20 transition-transform duration-700 hover:-rotate-2 hover:scale-[1.02] motion-reduce:transition-none" aria-label="Scanning a student code on iPhone" role="img">
                <div className="mx-auto mb-4 h-5 w-24 rounded-full bg-neutral-800" />
                <p className="text-sm font-semibold">Grade 10 Mathematics</p>
                <p className="text-xs text-muted-foreground">Group A · Live</p>
                <div className="relative mt-4 grid aspect-square place-items-center overflow-hidden rounded-2xl bg-neutral-900">
                  <HugeiconsIcon icon={QrCodeIcon} size={88} strokeWidth={1} className="text-white/80" />
                  {["left-3 top-3 border-l-2 border-t-2", "right-3 top-3 border-r-2 border-t-2", "bottom-3 left-3 border-b-2 border-l-2", "bottom-3 right-3 border-b-2 border-r-2"].map(corner => <span key={corner} className={cn("absolute size-8 rounded-sm border-primary", corner)} />)}
                  <span className="absolute inset-x-6 top-1/2 h-0.5 bg-primary shadow-[0_0_16px_var(--primary)] motion-safe:animate-[pulse_1.6s_ease-in-out_infinite]" />
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-primary/10 p-3 text-xs motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-700">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} strokeWidth={1.5} className="text-primary" />
                  <span><span className="block font-medium">Omar Nasser</span><span className="text-muted-foreground">Checked in · Present</span></span>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section id="tools" aria-labelledby="tools-heading" className="scroll-mt-16 py-16 sm:py-24">
          <div className={container}>
            <Reveal><h2 id="tools-heading" className={cn(title, "max-w-[18ch]")}>And the tools that make it all run.</h2></Reveal>
            <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tools.map((tool, index) => (
                <li key={tool.title}>
                  <Reveal delay={(index % 3) * 80} className="h-full">
                    <Card className="group/tool h-full gap-3 p-5 shadow-none transition-[translate,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                      <span className="flex items-center justify-between">
                        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 group-hover/tool:scale-110 group-hover/tool:-rotate-6"><HugeiconsIcon icon={tool.icon} size={20} strokeWidth={1.5} aria-hidden="true" /></span>
                        {tool.soon && <Badge variant="outline">Soon</Badge>}
                      </span>
                      <h3 className="font-sans text-base font-semibold">{tool.title}</h3>
                      <p className="text-sm text-muted-foreground">{tool.detail}</p>
                    </Card>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="questions" aria-labelledby="questions-heading" className="scroll-mt-16 border-t py-16 sm:py-24">
          <div className={cn(container, "grid items-start gap-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] md:gap-12")}>
            <h2 id="questions-heading" className={title}>Before you start</h2>
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
          <Reveal>
            <h2 id="start-heading" className={cn(title, "px-4")}>{isSignedIn ? "Your academy is waiting." : "Bring your academy into one place."}</h2>
            <Button asChild size="lg" variant="secondary" className="group/cta mt-8 h-11 gap-2 rounded-full px-6">
              <a href={primaryHref}>{primaryLabel}<HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} className="transition-transform group-hover/cta:translate-x-1" aria-hidden="true" /></a>
            </Button>
          </Reveal>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
