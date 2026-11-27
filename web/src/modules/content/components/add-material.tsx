import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ContentItem } from "../types";
import { MaterialUploader, TILE, TileIcon, type MaterialUpload } from "./uploader";
import { KIND_ICONS } from "./kind-icon";
import { YoutubeMaterial } from "./youtube-material";
import { AssessmentPicker } from "./assessment-picker";

/** The tiles under the material list: upload a file, or add an assessment. Answers are dropped onto an assessment. */
export function AddMaterial({ academyId, unitId, version, items, dirty, disabled, upload, onAdd, onUploaded, onCreated }: {
  academyId: string; unitId: string; version: number; items: ContentItem[]; dirty: boolean; disabled: boolean;
  upload: MaterialUpload; onAdd: (item: ContentItem) => void; onUploaded: (item: ContentItem) => Promise<void>; onCreated: () => Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  return <div className="grid items-start gap-2 sm:grid-cols-2 lg:grid-cols-3">
    <MaterialUploader upload={upload} disabled={disabled} />
    <YoutubeMaterial academyId={academyId} unitId={unitId} disabled={disabled} onAdded={onUploaded} />
    <Button variant="ghost" className={`${TILE} h-auto justify-start font-normal`} disabled={disabled} onClick={() => setPicking(true)}>
      <TileIcon icon={KIND_ICONS.assessment} /><span className="text-sm font-medium">Add assessment</span>
    </Button>
    <Dialog open={picking} onOpenChange={setPicking}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add assessment</DialogTitle><DialogDescription className="sr-only">Attach an existing assessment or create one in this unit.</DialogDescription></DialogHeader>
        <AssessmentPicker academyId={academyId} unitId={unitId} items={items} version={version} dirty={dirty} disabled={disabled} onAdd={item => { onAdd(item); setPicking(false); }} onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  </div>;
}
