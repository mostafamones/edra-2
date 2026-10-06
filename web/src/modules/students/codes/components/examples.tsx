import { Badge } from "@/components/ui/badge";

import { exampleStudentCodes, parseStudentCodePattern } from "../pattern";

/** Illustrative codes for a format; reserves nothing. Renders nothing for an invalid format. */
export function PatternExamples({ pattern, compact = false, inline = false }: { pattern: string; compact?: boolean; inline?: boolean }) {
  const parsed = parseStudentCodePattern(pattern);
  if (!parsed.ok) return null;
  const [first, second, third, last] = exampleStudentCodes(parsed.value);
  const codes = (compact ? [first, second] : [first, second, third]).filter(Boolean);
  if (inline) {
    return <span className="truncate font-mono text-xs text-muted-foreground">{[first, second].filter(Boolean).join(", ")}</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      {codes.map((code) => <Badge key={code} variant="outline" className="font-mono">{code}</Badge>)}
      {!compact && last && <><span aria-hidden="true">…</span><Badge variant="outline" className="font-mono">{last}</Badge></>}
      {!compact && <span>{parsed.value.capacity.toLocaleString("en")} possible codes</span>}
    </div>
  );
}
