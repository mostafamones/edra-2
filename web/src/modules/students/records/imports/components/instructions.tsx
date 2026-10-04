"use client";

import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ImportFormat } from "../types";
import { buildTemplate, instructionLines, TEMPLATE_MIME, templateFileName, type ImportReference } from "../templates";

const FORMAT_NAMES: Record<ImportFormat, string> = { csv: "CSV", json: "JSON", xlsx: "Excel" };

/** Saves generated content as a download. */
export function downloadFile(content: BlobPart, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** The template download and the academy's valid levels, tracks, groups, and student types. */
export function ImportInstructions({ format, reference }: { format: ImportFormat; reference: ImportReference | null }) {
  const [downloading, setDownloading] = useState(false);
  const [open, setOpen] = useState(false);
  const lines = reference ? instructionLines(reference) : [];

  async function download() {
    if (!reference) return;
    setDownloading(true);
    try {
      downloadFile(await buildTemplate(format, reference), templateFileName(format), TEMPLATE_MIME[format]);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => void download()} disabled={!reference || downloading}>
          <Download />{downloading ? "Preparing…" : `${FORMAT_NAMES[format]} template`}
        </Button>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm">
            File guidelines<ChevronDown className={open ? "rotate-180 transition-transform" : "transition-transform"} />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">Existing students are skipped. Review all rows before importing.</p>
        <dl className="grid gap-x-6 gap-y-1 py-3 text-sm sm:grid-cols-[10rem_1fr]">
          {lines.slice(1).map(([term, description], index) => term === undefined ? (
            <div key={index} className="h-2 sm:col-span-2" aria-hidden="true" />
          ) : (
            <div key={index} className="contents">
              <dt className="font-medium" dir="auto">{term}</dt>
              <dd className="text-muted-foreground" dir="auto">{description}</dd>
            </div>
          ))}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  );
}
