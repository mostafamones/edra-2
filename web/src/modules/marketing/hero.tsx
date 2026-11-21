import {
  IconArrowDown, IconArrowRight, IconBook, IconCalendar, IconCheck,
  IconClipboardCheck, IconPlayerPlay, IconSchool,
} from "@/components/shared/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { WorkflowStep } from "./workflow";

const previews = [
  { step: "attendance", icon: IconCalendar, title: "Tuesday class", label: "Attendance", status: "Roster" },
  { step: "lessons", icon: IconBook, title: "Quadratic equations", label: "Lessons", status: "Released" },
  { step: "results", icon: IconClipboardCheck, title: "Practice problems", label: "Results", status: "Announced" },
] as const;

export function MarketingHero({ primaryHref, primaryLabel, onExplore }: {
  primaryHref: string;
  primaryLabel: string;
  onExplore: (step: WorkflowStep) => void;
}) {
  return (
    <section aria-labelledby="home-heading" className="isolate overflow-hidden px-4 pb-10 pt-14 sm:px-8 sm:pb-16 sm:pt-20 lg:pt-24">
      <div className="relative z-10 mx-auto max-w-4xl text-center">
        <h1 id="home-heading" className="text-balance text-[clamp(2rem,8.5vw,3.25rem)] font-medium leading-[1.03] tracking-[-0.065em] sm:text-[clamp(3rem,5.7vw,5.25rem)]">
          Run your academy.<br /> Keep learning moving.
        </h1>
        <p className="mx-auto mt-5 max-w-[48ch] text-pretty text-base leading-relaxed text-zinc-300 sm:mt-6 sm:text-lg">
          Take attendance in class, release lessons online, and keep every result on the same student record.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2 sm:gap-3">
          <Button asChild size="lg" className="h-11 gap-2 rounded-full bg-emerald-300 px-5 text-emerald-950 hover:bg-emerald-200 motion-reduce:transition-none">
            <a href={primaryHref}>{primaryLabel}<IconArrowRight aria-hidden="true" /></a>
          </Button>
          <Button asChild variant="outline" size="lg" className="group h-11 gap-2 rounded-full border-white/15 bg-white/5 px-5 hover:bg-white/10 motion-reduce:transition-none">
            <a href="#workflow">
              Try the demo
              <IconArrowDown className="motion-safe:transition-transform motion-safe:group-hover:translate-y-0.5" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>

      <div className="relative mx-auto mt-10 max-w-[72rem] border-y border-white/10 px-2 py-6 sm:mt-14 sm:px-6 sm:py-10">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_100%,#164532_0%,transparent_72%)] opacity-65" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0,transparent_71px,#ffffff0d_72px)] [mask-image:linear-gradient(transparent,black)]" />

        <Card aria-hidden="true" className="pointer-events-none absolute left-6 top-[27%] hidden w-[28%] gap-4 rounded-xl bg-[#18221c] p-5 shadow-xl ring-1 ring-white/10 lg:flex">
          <div className="flex items-center gap-2 font-semibold text-zinc-200">
            <IconCalendar className="size-4 text-emerald-300" />Session roster
          </div>
          <div className="divide-y divide-white/10 text-sm text-zinc-300">
            {["Mariam Hassan", "Omar Nasser", "Youssef Ali"].map((name, index) => (
              <div key={name} className="flex items-center gap-2.5 py-3">
                <span className="grid size-7 place-items-center rounded-md bg-white/10 text-xs">{name.split(" ").map(part => part[0]).join("")}</span>
                {name}
                {index < 2 && <IconCheck className="size-4 text-emerald-300" />}
              </div>
            ))}
          </div>
        </Card>

        <Card aria-hidden="true" className="pointer-events-none absolute right-6 top-[35%] hidden w-[28%] items-end gap-4 rounded-xl bg-[#18221c] p-5 shadow-xl ring-1 ring-white/10 lg:flex">
          <div className="w-[76%]">
            <div className="flex items-center gap-2 font-semibold text-zinc-200">
              <IconSchool className="size-4 text-emerald-300" />Student view
            </div>
            <div className="mt-4 flex items-center gap-2 border-y border-white/10 py-3 text-xs text-zinc-300">
              <IconPlayerPlay className="size-4 text-emerald-300" />Worked examples
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-zinc-300">
              Assignment <span className="font-semibold tabular-nums text-emerald-300">18 / 20</span>
            </div>
          </div>
        </Card>

        <Card className="relative mx-auto w-full max-w-[39rem] gap-0 rounded-2xl bg-[#1d2921] py-0 shadow-[0_20px_55px_#0006] ring-1 ring-white/15">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-white/10 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="hidden size-8 place-items-center rounded-lg bg-emerald-300/15 text-emerald-300 min-[390px]:grid">
                <IconSchool className="size-4" aria-hidden="true" />
              </span>
              <h2 className="font-sans font-semibold text-white sm:text-base">Grade 10 Mathematics</h2>
            </div>
            <Badge variant="outline" className="rounded-full border-white/20 text-zinc-300">Sample class</Badge>
          </div>
          <ul className="divide-y divide-white/10 px-2 py-1 sm:px-3">
            {previews.map(({ step, icon: Icon, title, label, status }) => (
              <li key={step}>
                <a
                  href="#workflow"
                  onClick={() => onExplore(step)}
                  className="group flex min-h-16 items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-white/7 focus-visible:outline-2 focus-visible:outline-emerald-300 motion-safe:transition-colors sm:gap-4 sm:px-3"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/8 text-emerald-300 sm:size-9">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white">{title}</p>
                    <p className="text-xs text-zinc-300">{label}</p>
                  </div>
                  <span className="text-right text-xs text-emerald-300">{status}</span>
                  <IconArrowRight className="hidden size-4 shrink-0 text-zinc-300 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5 sm:block" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  );
}
