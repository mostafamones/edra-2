import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Fades its content up the first time it scrolls into view. Server HTML and content already on screen stay
 * visible, so nothing depends on JavaScript to appear.
 */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"static" | "hidden" | "shown">("static");

  useEffect(() => {
    const element = ref.current;
    if (!element || matchMedia("(prefers-reduced-motion: reduce)").matches || element.getBoundingClientRect().top < innerHeight) return;
    setState("hidden");
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setState("shown");
      observer.disconnect();
    }, { rootMargin: "0px 0px -8% 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ transitionDelay: state === "shown" ? `${delay}ms` : undefined }}
      className={cn("transition-[opacity,translate] duration-700 ease-out", state === "hidden" && "translate-y-8 opacity-0", className)}>
      {children}
    </div>
  );
}
