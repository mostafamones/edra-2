import {
  ArrowDownRight,
  BookOpenText,
  CalendarDays,
  Check,
  ClipboardCheck,
  UsersRound,
} from "lucide-react";
import { IconArrowRight, IconSchool } from "@tabler/icons-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

const connections = [
  {
    number: "01",
    title: "Know your students",
    description:
      "Keep student records, groups, and learning paths together from the first day.",
    icon: UsersRound,
  },
  {
    number: "02",
    title: "Run the day",
    description:
      "Plan sessions, track attendance, and record results as teaching happens.",
    icon: CalendarDays,
  },
  {
    number: "03",
    title: "Keep learning moving",
    description:
      "Connect protected lessons and useful parent updates to each student’s progress.",
    icon: BookOpenText,
  },
];

export default async function Home() {
  let isSignedIn = false;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    isSignedIn = !error && Boolean(data?.claims);
  } catch {
    // Keep the public landing page available if auth is temporarily unavailable.
  }

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="relative isolate">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-56 right-[-18rem] -z-10 size-[42rem] rounded-full bg-violet-500/10 blur-3xl"
        />

        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
          <a className="flex items-center gap-3" href="#top" aria-label="Edra home">
            <span className="grid size-10 place-items-center rounded-md bg-primary text-primary-foreground">
              <IconSchool className="size-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Edra</span>
          </a>

          <nav aria-label="Main navigation" className="hidden items-center gap-8 text-sm text-muted-foreground sm:flex">
            <a className="transition-colors hover:text-foreground" href="#workflow">
              The workflow
            </a>
            <a className="transition-colors hover:text-foreground" href="#about">
              About Edra
            </a>
          </nav>

          <div className="flex items-center gap-3">
            {isSignedIn ? (
              <Button asChild size="default" className="rounded-full px-4">
                <Link href="/app">
                  Go to app
                  <IconArrowRight />
                </Link>
              </Button>
            ) : (
              <>
                <a className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline" href="/auth/login">
                  Sign in
                </a>
                <Button asChild size="sm" className="rounded-full px-4">
                  <a href="/auth/signup">Get started</a>
                </Button>
              </>
            )}
          </div>
        </header>

        <section
          id="top"
          className="mx-auto grid w-full max-w-7xl items-center gap-14 px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16 lg:px-12 lg:pb-28 lg:pt-28"
        >
          <div>
            <p className="text-base font-medium tracking-tight sm:text-lg">
              A new <span className="font-semibold text-violet-700 dark:text-violet-300">Education Era</span>
            </p>

            <h1 className="mt-7 max-w-3xl text-balance text-5xl font-semibold leading-[1.06] tracking-[-0.055em] sm:text-6xl lg:text-[4.65rem]">
              More room to teach.
              <span className="block text-muted-foreground">Less to keep track of.</span>
            </h1>

            <p className="mt-7 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Edra is being built to bring your students, sessions, attendance,
              results, and lessons into one calm academy workspace.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Button asChild size="lg" className="rounded-full px-4">
                <a href={isSignedIn ? "/app" : "/auth/signup"}>
                  {isSignedIn ? "Go to app" : "Create your account"}
                  <IconArrowRight />
                </a>
              </Button>
              <a
                className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                href="#about"
              >
                Why Edra
                <ArrowDownRight className="size-4" aria-hidden="true" />
              </a>
            </div>

            <p className="mt-9 flex items-center gap-2 text-sm text-muted-foreground">
              <Check className="size-4 text-violet-600 dark:text-violet-300" aria-hidden="true" />
              One connected view of academy life
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div
              aria-hidden="true"
              className="absolute -inset-4 rounded-[2.25rem] border border-violet-500/10 bg-violet-500/5"
            />
            <Card className="relative gap-0 overflow-hidden rounded-[1.75rem] border-border/80 bg-card py-0 shadow-2xl shadow-violet-950/10 dark:shadow-black/30">
              <div className="flex items-center justify-between border-b border-border/70 px-5 py-4 sm:px-6">
                <div className="flex items-center gap-2.5">
                  <span className="flex items-center gap-1.5" aria-hidden="true">
                    <span className="size-2 rounded-full bg-violet-400" />
                    <span className="size-2 rounded-full bg-violet-400/40" />
                    <span className="size-2 rounded-full bg-violet-400/20" />
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    The Edra workspace
                  </span>
                </div>
                <Badge variant="secondary" className="rounded-full text-[10px] font-normal">
                  Concept preview
                </Badge>
              </div>

              <CardContent className="p-5 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      One connected flow
                    </p>
                    <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
                      From the first class onward
                    </h2>
                  </div>
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-300">
                    <IconSchool className="size-5" aria-hidden="true" />
                  </span>
                </div>

                <div className="mt-7 space-y-0">
                  <div className="relative flex gap-4 pb-6">
                    <div className="absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-px bg-border" aria-hidden="true" />
                    <span className="z-10 grid size-10 shrink-0 place-items-center rounded-xl border bg-background text-violet-700 dark:text-violet-300">
                      <UsersRound className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1 rounded-xl border border-border/80 bg-muted/30 px-4 py-3">
                      <p className="text-sm font-medium">Students &amp; groups</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        The right people in the right learning path
                      </p>
                    </div>
                  </div>
                  <div className="relative flex gap-4 pb-6">
                    <div className="absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-px bg-border" aria-hidden="true" />
                    <span className="z-10 grid size-10 shrink-0 place-items-center rounded-xl border bg-background text-violet-700 dark:text-violet-300">
                      <ClipboardCheck className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1 rounded-xl border border-border/80 bg-muted/30 px-4 py-3">
                      <p className="text-sm font-medium">Sessions &amp; progress</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Attendance and results tied to every session
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <span className="z-10 grid size-10 shrink-0 place-items-center rounded-xl border bg-background text-violet-700 dark:text-violet-300">
                      <BookOpenText className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1 rounded-xl border border-border/80 bg-muted/30 px-4 py-3">
                      <p className="text-sm font-medium">Lessons &amp; updates</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Learning materials and parents kept in the loop
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="absolute -bottom-5 -left-4 hidden rounded-2xl border border-border/80 bg-background px-4 py-3 text-xs font-medium shadow-lg sm:flex sm:items-center sm:gap-2">
              <span className="grid size-6 place-items-center rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-300">
                <Check className="size-3.5" aria-hidden="true" />
              </span>
              Built around the teaching day
            </div>
          </div>
        </section>
      </div>

      <section id="workflow" className="border-t border-border/70 bg-muted/20 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700 dark:text-violet-300">
                The workflow
              </p>
              <h2 className="mt-3 max-w-xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Everything around teaching, connected.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">
              The first release is focused on the everyday work that helps an
              academy run clearly and consistently.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {connections.map(({ number, title, description, icon: Icon }) => (
              <Card key={number} className="gap-0 rounded-2xl border-border/70 py-0 shadow-none">
                <CardContent className="flex h-full flex-col p-6 sm:p-7">
                  <div className="flex items-start justify-between">
                    <span className="grid size-11 place-items-center rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-300">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">{number}</span>
                  </div>
                  <h3 className="mt-8 text-lg font-semibold tracking-tight">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <footer id="about" className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <div>
          <p className="text-lg font-semibold tracking-tight">Edra</p>
          <p className="mt-1 text-sm text-muted-foreground">
            A calmer home for teacher-led academies.
          </p>
        </div>
        <a className="text-sm font-medium text-foreground underline-offset-4 hover:underline" href={isSignedIn ? "/app" : "/auth/signup"}>
          {isSignedIn ? "Go to app" : "Get started with Edra"}
        </a>
      </footer>
    </main>
  );
}
