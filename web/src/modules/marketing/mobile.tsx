import { useEffect, useRef, useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, QrCodeIcon, ScanIcon, SmartPhone01Icon, TeachingIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

const accent = "#30D158";
const students: [string, boolean][] = [["Adam Youssef", true], ["Farida Kamal", true], ["Hana Mostafa", false], ["Karim Adel", true], ["Laila Samir", false], ["Mariam Hassan", true]];

const steps = [
  { title: "Run a live session", detail: "Every student in the class, checked in with one tap.", icon: TeachingIcon, screen: SessionScreen },
  { title: "Scan to check in", detail: "Point the camera at a student code. Done.", icon: QrCodeIcon, screen: ScannerScreen },
  { title: "Mark paper work", detail: "Scan a student and enter marks part by part.", icon: ScanIcon, screen: MarkingScreen },
];

const cycle = 5000;

function Header({ back, title }: { back: string; title: string }) {
  return (
    <div className="px-5 pt-2">
      <span className="flex items-center text-[13px]" style={{ color: accent }}><HugeiconsIcon icon={ArrowLeft01Icon} size={18} strokeWidth={2} />{back}</span>
      <p className="mt-3 text-[22px] font-bold leading-tight tracking-tight">{title}</p>
    </div>
  );
}

function SessionScreen() {
  return (
    <>
      <Header back="Sessions" title="Grade 10 Maths" />
      <ul className="mx-4 mt-5 divide-y divide-white/[0.07] overflow-hidden rounded-2xl bg-[#1C1C1E]">
        {students.map(([name, here], index) => (
          <li key={name} style={{ animationDelay: `${index * 70}ms` }} className="flex items-center gap-3 px-3.5 py-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both">
            <span className="flex-1 text-[13px]">{name}</span>
            <span className={cn("grid size-5 place-items-center rounded-full", here ? "text-black" : "ring-1 ring-white/25")} style={here ? { background: accent } : undefined}>
              {here && <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={3} />}
            </span>
          </li>
        ))}
      </ul>
      <span className="absolute inset-x-4 bottom-6 flex items-center justify-center gap-1.5 rounded-full py-3 text-[13px] font-semibold text-black" style={{ background: accent }}>
        <HugeiconsIcon icon={ScanIcon} size={16} strokeWidth={2} />Open scanner
      </span>
    </>
  );
}

function ScannerScreen() {
  return (
    <>
      <Header back="Grade 10 Maths" title="Scanner" />
      <div className="relative mx-4 mt-5 grid aspect-square place-items-center overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_40%_30%,#3a3a3c,#0b0b0c)]">
        <span className="grid size-28 place-items-center rounded-2xl bg-white text-black motion-safe:animate-in motion-safe:zoom-in-90 motion-safe:duration-700"><HugeiconsIcon icon={QrCodeIcon} size={88} strokeWidth={1.25} /></span>
        <span className="absolute inset-x-8 top-1/2 h-0.5 rounded-full motion-safe:animate-[pulse_1.4s_ease-in-out_infinite]" style={{ background: accent, boxShadow: `0 0 18px ${accent}` }} />
      </div>
      <div className="mx-4 mt-4 flex items-center gap-3 rounded-2xl bg-[#1C1C1E] p-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:delay-700 motion-safe:duration-500 motion-safe:fill-mode-both">
        <span className="grid size-9 place-items-center rounded-full text-black" style={{ background: accent }}><HugeiconsIcon icon={Tick02Icon} size={18} strokeWidth={2.5} /></span>
        <span><span className="block text-[13px] font-semibold">Omar Nasser</span><span className="text-[11px] text-white/55">Checked in</span></span>
      </div>
    </>
  );
}

function MarkingScreen() {
  const parts: [string, string][] = [["Part A", "6/8"], ["Part B", "7/7"], ["Part C", "5/5"]];
  return (
    <>
      <Header back="Assignments" title="Mariam Hassan" />
      <ul className="mx-4 mt-5 divide-y divide-white/[0.07] overflow-hidden rounded-2xl bg-[#1C1C1E]">
        {parts.map(([part, mark], index) => (
          <li key={part} style={{ animationDelay: `${150 + index * 120}ms` }} className="flex items-center justify-between px-3.5 py-3.5 text-[13px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-4 motion-safe:fill-mode-both">
            {part}<span className="font-semibold tabular-nums">{mark}</span>
          </li>
        ))}
      </ul>
      <div className="mx-4 mt-3 flex items-baseline justify-between rounded-2xl bg-[#1C1C1E] px-4 py-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:delay-500 motion-safe:fill-mode-both">
        <span className="text-[13px] text-white/60">Total</span>
        <span className="text-[26px] font-bold tabular-nums" style={{ color: accent }}>18<span className="text-[13px] text-white/50">/20</span></span>
      </div>
    </>
  );
}

const depth = 22;

/** A CSS 3D phone: stacked layers give the body real thickness and side buttons, and it turns toward the pointer. */
function Phone({ children }: { children: ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  const turn = (x: number, y: number) => {
    body.current?.style.setProperty("--x", String(x));
    body.current?.style.setProperty("--y", String(y));
  };

  return (
    <div className="relative py-6 [perspective:1600px]"
      onPointerMove={event => {
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const box = event.currentTarget.getBoundingClientRect();
        turn((event.clientX - box.left) / box.width - 0.5, (event.clientY - box.top) / box.height - 0.5);
      }}
      onPointerLeave={() => turn(0, 0)}>
      <span aria-hidden="true" className="absolute bottom-0 left-1/2 h-10 w-56 -translate-x-1/3 rounded-[100%] bg-black/60 blur-2xl dark:bg-black" />
      <div ref={body} style={{ transform: "rotateY(calc(-26deg + var(--x, 0) * 30deg)) rotateX(calc(12deg - var(--y, 0) * 18deg)) rotateZ(4deg)" }}
        className="relative mx-auto w-[17.5rem] transition-transform duration-500 ease-out [transform-style:preserve-3d] motion-reduce:transition-none">
        <span aria-hidden="true" style={{ transform: "translateZ(-80px)" }} className="absolute inset-6 rounded-[3rem] bg-primary/40 blur-3xl" />
        {Array.from({ length: depth }, (_, layer) => (
          <div key={layer} aria-hidden="true" style={{ transform: `translateZ(${-(layer + 1)}px)` }}
            className={cn("absolute inset-0 rounded-[3.1rem]", layer === depth - 1 ? "bg-neutral-900" : layer < 2 || layer > depth - 4 ? "bg-neutral-500" : "bg-gradient-to-b from-neutral-400 via-neutral-600 to-neutral-500")}>
            {layer > 2 && layer < depth - 3 && ["top-28 h-7", "top-40 h-12", "top-56 h-12"].map(button => <span key={button} className={cn("absolute -left-[3px] w-[3px] rounded-l-sm bg-neutral-600", button)} />)}
            {layer > 2 && layer < depth - 3 && <span className="absolute -right-[3px] top-44 h-20 w-[3px] rounded-r-sm bg-neutral-600" />}
          </div>
        ))}
        <div className="rounded-[3.1rem] bg-gradient-to-br from-neutral-400 via-neutral-700 to-neutral-900 p-[3px]">
          <div className="rounded-[2.95rem] bg-black p-2.5">
            <div role="img" aria-label="Edra instructor app" className="relative h-[35rem] overflow-hidden rounded-[2.45rem] bg-black font-sans text-white antialiased">
              <div aria-hidden="true" className="flex h-11 items-center px-7 text-[12px] font-semibold">
                9:41<span className="absolute left-1/2 top-2.5 h-[1.6rem] w-[5.5rem] -translate-x-1/2 rounded-full bg-[#0b0b0b]" />
              </div>
              <div aria-hidden="true" className="absolute inset-x-0 bottom-0 top-11">{children}</div>
              <span aria-hidden="true" className="absolute bottom-1.5 left-1/2 h-1 w-28 -translate-x-1/2 rounded-full bg-white/80" />
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.09] via-transparent to-transparent" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The instructor companion: a drawn phone running the app's screens, stepped through by the feature list. */
export function MobileShowcase({ className }: { className?: string }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const Screen = steps[active].screen;

  useEffect(() => {
    if (paused || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setTimeout(() => setActive(current => (current + 1) % steps.length), cycle);
    return () => clearTimeout(timer);
  }, [active, paused]);

  return (
    <section id="mobile" aria-labelledby="mobile-heading" className={cn("relative isolate scroll-mt-16 overflow-hidden py-20 sm:py-28", className)}>
      <div aria-hidden="true" className="absolute right-[10%] top-1/2 -z-10 size-[34rem] -translate-y-1/2 rounded-full bg-primary/15 blur-[140px]" />
      <div className="mx-auto grid w-full max-w-[76rem] items-center gap-14 px-4 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-28 lg:px-10">
        <Reveal>
          <p className="mb-4 flex items-center gap-2 text-sm font-medium text-primary">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10"><HugeiconsIcon icon={SmartPhone01Icon} size={18} strokeWidth={1.5} aria-hidden="true" /></span>
            iPhone & Android
          </p>
          <h2 id="mobile-heading" className="text-balance font-heading text-[clamp(2rem,4.4vw,3.4rem)] font-semibold leading-[1.04] tracking-[-0.045em]">Teach with your phone in hand.</h2>
          <ul className="mt-8 space-y-1.5" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
            {steps.map((step, index) => {
              const current = index === active;
              return (
                <li key={step.title}>
                  <button type="button" aria-pressed={current} onClick={() => setActive(index)} onFocus={() => setActive(index)}
                    className={cn("flex w-full items-start gap-4 rounded-2xl p-4 text-left outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-ring",
                      current ? "bg-card ring-1 ring-foreground/10" : "hover:bg-muted/60")}>
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl transition-colors duration-300", current ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")}>
                      <HugeiconsIcon icon={step.icon} size={20} strokeWidth={1.5} aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block font-semibold">{step.title}</span>
                      <span className={cn("grid text-sm text-muted-foreground transition-[grid-template-rows,opacity] duration-300", current ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                        <span className="overflow-hidden">{step.detail}</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Reveal>
        <Reveal delay={120}>
          <Phone><div key={active} className="absolute inset-0 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-6 motion-safe:duration-500"><Screen /></div></Phone>
        </Reveal>
      </div>
    </section>
  );
}
