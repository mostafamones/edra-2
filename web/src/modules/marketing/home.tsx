import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { MarketingFooter } from "./footer";
import { MobileShowcase } from "./mobile";
import { MarketingNav, type NavProps } from "./nav";
import { Reveal } from "./reveal";

const container = "mx-auto w-full max-w-[76rem] px-4 sm:px-8 lg:px-10";
const title = "text-balance font-heading text-[clamp(2rem,4.4vw,3.4rem)] font-semibold leading-[1.04] tracking-[-0.045em]";
const lead = "max-w-[44ch] text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg";

const questions = [
  { question: "Can I teach in person and online in the same academy?", answer: "Yes. Edra supports classroom, online and hybrid students, with attendance and results kept on the same student record." },
  { question: "Can I add students before they have an account?", answer: "Yes. Staff can add or import students and record attendance and marks before the students join online." },
  { question: "Which features are marked “Soon”?", answer: "They are planned and specified, and are being built now. Everything else on this page works in Edra today." },
  { question: "Is there a mobile app?", answer: "Yes. The instructor companion runs sessions, checks students in by code and marks paper work on iPhone and Android." },
];

export function MarketingHome(props: NavProps) {
  const { isSignedIn, primaryHref } = props;
  const primaryLabel = isSignedIn ? "Go to app" : "Get started";

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

        <MobileShowcase className="border-t" />

        <section id="questions" aria-labelledby="questions-heading" className="scroll-mt-16 border-t py-16 sm:py-24">
          <div className={cn(container, "grid items-start gap-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] md:gap-12")}>
            <h2 id="questions-heading" className={title}>Before you start</h2>
            <Accordion type="single" collapsible className="border-y motion-reduce:[&_[data-slot=accordion-content]]:animate-none">
              {questions.map(({ question, answer }) => (
                <AccordionItem key={question} value={question}>
                  <AccordionTrigger className="items-center gap-4 rounded-none px-0 py-5 text-base hover:no-underline [&_svg]:[stroke-width:1.5]">
                    {question}
                  </AccordionTrigger>
                  <AccordionContent className="h-auto pb-5 text-base leading-relaxed text-muted-foreground">
                    {answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
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
