import { IconArrowDown, IconArrowRight, IconCheck, IconSchool } from "@/components/shared/icons";
import { Button } from "@/components/ui/button";
import { WorkflowPreview } from "./workflow";

const container = "mx-auto w-full max-w-[82rem] px-5 sm:px-8 lg:px-12";

export function MarketingHome({ isSignedIn, primaryHref, signInHref }: {
  isSignedIn: boolean;
  primaryHref: string;
  signInHref: string;
}) {
  const primaryLabel = isSignedIn ? "Go to app" : "Get started";

  return (
    <div id="top" className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className={`${container} flex min-h-[4.5rem] items-center justify-between gap-2 py-3`}>
          <a href="#top" aria-label="Edra home" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4">
            <span className="grid size-9 place-items-center rounded-[0.7rem] bg-primary text-primary-foreground">
              <IconSchool className="size-5" aria-hidden="true" />
            </span>
            <span className="font-heading text-[1.375rem] font-semibold tracking-tight">Edra</span>
          </a>
          <nav aria-label="Main navigation" className="flex items-center gap-2 sm:gap-4">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <a href="#workflow">How it works</a>
            </Button>
            {!isSignedIn && (
              <Button asChild variant="ghost" className="px-2.5 sm:px-3">
                <a href={signInHref}>Sign in</a>
              </Button>
            )}
            <Button asChild className="rounded-full px-3.5 sm:px-4">
              <a href={primaryHref}>{primaryLabel}</a>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section aria-labelledby="home-heading" className={`${container} grid items-center gap-9 pb-14 pt-12 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] md:gap-10 md:py-14 lg:gap-14 lg:py-[4.5rem]`}>
          <div>
            <p className="text-sm font-semibold text-primary dark:text-emerald-300">For teacher-led academies</p>
            <h1 id="home-heading" className="mt-4 max-w-[12ch] text-pretty text-[clamp(2.625rem,5.2vw,4.875rem)] font-semibold leading-[1.04] tracking-[-0.065em]">
              One place to run your academy.
            </h1>
            <p className="mt-5 max-w-[38ch] text-pretty text-base leading-relaxed text-muted-foreground lg:mt-6 lg:text-xl">
              Keep student records, attendance, lessons, and results together, from the classroom to online learning.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-2 sm:gap-3 lg:mt-8">
              <Button asChild size="lg" className="h-11 gap-2 rounded-full px-4">
                <a href={primaryHref}>
                  {isSignedIn ? primaryLabel : "Create your account"}
                  <IconArrowRight aria-hidden="true" />
                </a>
              </Button>
              <Button asChild variant="ghost" size="lg" className="h-11 gap-2 rounded-full px-3 sm:px-4">
                <a href="#workflow">
                  See how it works
                  <IconArrowDown aria-hidden="true" />
                </a>
              </Button>
            </div>
          </div>

          <div className="relative isolate">
            <img
              src="/home/classroom-1254.webp"
              srcSet="/home/classroom-640.webp 640w, /home/classroom-1254.webp 1254w"
              sizes="(min-width: 82rem) 38rem, (min-width: 48rem) 50vw, calc(100vw - 2.5rem)"
              width={1254}
              height={1254}
              fetchPriority="high"
              alt="A teacher guides three students through a math problem around a classroom table."
              className="aspect-[1.12] w-full rounded-3xl bg-muted object-cover object-[center_55%] md:aspect-square lg:aspect-[1.16]"
            />
            <div className="absolute inset-x-3 bottom-3 flex w-fit max-w-[calc(100%-1.5rem)] items-center gap-3 rounded-2xl border bg-card px-3.5 py-2.5 text-card-foreground shadow-lg sm:inset-x-5 sm:bottom-5 sm:px-4 sm:py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary dark:bg-primary/25 dark:text-emerald-300">
                <IconCheck className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Attendance finalized</p>
                <p className="text-xs text-muted-foreground">Grade 10 Mathematics</p>
              </div>
            </div>
          </div>
        </section>

        <section id="workflow" aria-labelledby="workflow-heading" className="scroll-mt-6 border-y bg-primary/[0.055] py-12 sm:py-16 lg:py-20">
          <div className={`${container} grid items-center gap-7 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] md:gap-10 lg:gap-14`}>
            <div>
              <h2 id="workflow-heading" className="max-w-[15ch] text-pretty text-3xl font-semibold leading-[1.12] tracking-[-0.045em] lg:text-5xl">
                From roll call to results.
              </h2>
              <p className="mt-4 max-w-[41ch] text-pretty leading-relaxed text-foreground/75 lg:text-lg">
                Take attendance in class, release lessons online, and share marks from the same workspace.
              </p>
            </div>
            <WorkflowPreview />
          </div>
        </section>
      </main>

      <footer className={`${container} flex flex-wrap items-center justify-between gap-4 py-8`}>
        <a href="#top" className="rounded-sm font-heading text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4">Edra</a>
        <Button asChild variant="ghost" className="rounded-full px-3">
          <a href={primaryHref}>{primaryLabel}</a>
        </Button>
      </footer>
    </div>
  );
}
