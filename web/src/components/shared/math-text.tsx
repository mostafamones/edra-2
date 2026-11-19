import { useMemo } from "react";
import { mathDirection, normalizeMathSource, renderMath, splitMath } from "@/lib/math";
import { cn } from "@/lib/utils";

/** Editable storage stays LaTeX; display uses native, accessible MathML and isolated equation direction. */
export function MathText({ value, className }: { value: string; className?: string }) {
  const segments = useMemo(() => splitMath(normalizeMathSource(value)).map(segment => {
    if (segment.kind !== "math") return { ...segment, html: undefined };
    try { return { ...segment, html: renderMath(segment.value, segment.display) }; }
    catch { return { ...segment, html: undefined }; }
  }), [value]);
  return <span dir={mathDirection(value)} className={cn("whitespace-pre-wrap break-words leading-loose [&_math]:[math-style:normal]", className)}>
    {segments.map((segment, index) => segment.kind === "math" && segment.html
      ? <bdi key={index} dir="ltr" className={cn("align-middle whitespace-normal [unicode-bidi:isolate]", segment.display ? "block w-max min-w-full py-2 text-center" : "inline-block px-1 py-1")}
          dangerouslySetInnerHTML={{ __html: segment.html }} />
      : <span key={index}>{segment.kind === "math" ? segment.source : segment.value}</span>)}
  </span>;
}
