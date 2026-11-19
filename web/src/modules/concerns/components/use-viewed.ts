import { useEffect, useEffectEvent, type RefObject } from "react";

/** Receipts acknowledge only intersecting messages while this open panel owns browser focus. */
export function useViewedConcernMessages({ root, active, messageVersion, onViewed }: {
  root: RefObject<HTMLDivElement | null>; active: boolean; messageVersion: string; onViewed: (seq: number) => void;
}) {
  const report = useEffectEvent(onViewed);
  useEffect(() => {
    const element = root.current;
    if (!active || !element || typeof IntersectionObserver === "undefined") return;
    const visible = new Map<Element, number>();
    const focused = () => document.visibilityState === "visible" && document.hasFocus()
      && !!element.closest("[data-concern-panel]")?.contains(document.activeElement);
    const acknowledge = () => { if (focused() && visible.size) report(Math.max(...visible.values())); };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const seq = Number((entry.target as HTMLElement).dataset.concernSeq);
        // A small intersection is enough for tall messages; zero-size or hidden nodes never count.
        if (entry.isIntersecting && entry.intersectionRect.height > 0) visible.set(entry.target, seq);
        else visible.delete(entry.target);
      }
      acknowledge();
    }, { root: element, threshold: [0, 0.5, 1] });
    element.querySelectorAll("[data-concern-seq]").forEach((message) => observer.observe(message));
    window.addEventListener("focus", acknowledge);
    document.addEventListener("focusin", acknowledge);
    document.addEventListener("visibilitychange", acknowledge);
    return () => { observer.disconnect(); window.removeEventListener("focus", acknowledge); document.removeEventListener("focusin", acknowledge); document.removeEventListener("visibilitychange", acknowledge); };
  }, [active, messageVersion, root]);
}
