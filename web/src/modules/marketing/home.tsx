import { IconArrowDown, IconArrowRight, IconSchool } from "@/components/shared/icons";
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
    <div id="top" className="flex min-h-screen flex-col bg-background text-foreground">
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
              <a href="#workflow">Explore workspace</a>
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

      <main className="flex flex-1 items-center">
        <section aria-labelledby="home-heading" className={`${container} grid items-center gap-9 pb-14 pt-12 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1fr)] lg:gap-12 lg:py-20 xl:gap-16`}>
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
              <Button asChild variant="ghost" size="lg" className="group h-11 gap-2 rounded-full px-3 sm:px-4">
                <a href="#workflow">
                  Try the demo
                  <IconArrowDown className="motion-safe:transition-transform motion-safe:group-hover:translate-y-0.5" aria-hidden="true" />
                </a>
              </Button>
            </div>
          </div>

          <WorkflowPreview />
        </section>
      </main>

      <footer className="border-t">
        <div className={`${container} flex flex-wrap items-center justify-between gap-4 py-6`}>
          <a href="#top" className="rounded-sm font-heading text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4">Edra</a>
          <Button asChild variant="ghost" className="rounded-full px-3">
            <a href={primaryHref}>{primaryLabel}</a>
          </Button>
        </div>
      </footer>
    </div>
  );
}
