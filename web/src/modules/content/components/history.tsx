"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { Clock01Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { ContentDetail } from "../data";
import { revisionChanges } from "../revisions";
import { documentSchema } from "../types";

/** Published versions of a unit, newest first, with who published each one and what it changed. */
export function VersionHistory({ revisions, live }: { revisions: ContentDetail["revisions"]; live: boolean }) {
  const documents = revisions.map(r => documentSchema.safeParse(r.document));
  return <Sheet>
    <SheetTrigger asChild><Button variant="outline"><HugeiconsIcon icon={Clock01Icon} strokeWidth={1.5} aria-hidden="true" />History</Button></SheetTrigger>
    <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
      <SheetHeader className="border-b">
        <SheetTitle className="text-lg font-semibold">Version history</SheetTitle>
        <SheetDescription>{revisions.length} published version{revisions.length === 1 ? "" : "s"}</SheetDescription>
      </SheetHeader>
      <ol className="min-h-0 flex-1 overflow-y-auto p-6">
        {revisions.map((revision, index) => {
          const current = documents[index], previous = index === revisions.length - 1 ? null : documents[index + 1];
          // A revision whose document, or whose predecessor's document, no longer parses cannot be compared.
          const changes = current.success && previous?.success !== false ? revisionChanges(previous?.data ?? null, current.data) : null;
          const date = new Date(revision.published_at);
          return <li key={revision.revision} className="relative flex gap-4 pb-8 last:pb-0">
            {index < revisions.length - 1 && <span className="absolute top-5 bottom-0 left-[5px] w-px bg-border" aria-hidden="true" />}
            <span className={`relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 ${index === 0 ? "border-primary bg-primary" : "border-muted-foreground/40 bg-popover"}`} aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="space-y-0.5">
                <p className="flex items-center gap-2 font-medium">Version {revision.revision}{index === 0 && live && <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">Live</Badge>}</p>
                <p className="text-xs text-muted-foreground"><span dir="auto">{revision.publisher ?? "Unknown staff member"}</span> · <time dateTime={revision.published_at} className="tabular-nums">{date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time></p>
              </div>
              {changes
                ? <ul className="space-y-1 rounded-lg bg-muted/40 px-3 py-2.5 text-sm">{changes.map((change, i) => <li key={i} dir="auto" className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden="true" />{change}</li>)}</ul>
                : <p className="text-sm text-muted-foreground">Changes unavailable</p>}
            </div>
          </li>;
        })}
      </ol>
    </SheetContent>
  </Sheet>;
}
