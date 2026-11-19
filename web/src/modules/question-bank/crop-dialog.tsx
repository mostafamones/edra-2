import { useId, useRef, useState, type PointerEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CropIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cropSource, type QuestionVisual, type VisualBounds } from "./evidence";
import type { SourceCrop } from "./parser";
import { useImageBlob } from "./use-image";

const edges = ["left", "top", "right", "bottom"] as const;
type Edge = typeof edges[number];
type CropFields = Record<Edge, string>;
type Point = { x: number; y: number };

function asFields(bounds: VisualBounds): CropFields {
  return Object.fromEntries(edges.map(edge => [edge, String(Math.round(bounds[edge] * 1000) / 10)])) as CropFields;
}

function readFields(fields: CropFields): VisualBounds | undefined {
  const bounds = Object.fromEntries(edges.map(edge => [edge, Number(fields[edge]) / 100])) as VisualBounds;
  if (edges.some(edge => !fields[edge].trim() || !Number.isFinite(bounds[edge]) || bounds[edge] < 0 || bounds[edge] > 1)) return;
  if (bounds.right - bounds.left < 0.0099 || bounds.bottom - bounds.top < 0.0099) return;
  return bounds;
}

function pointAt(event: PointerEvent<HTMLDivElement>): Point {
  const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  return { x: clamp((event.clientX - left) / width), y: clamp((event.clientY - top) / height) };
}

function between(a: Point, b: Point): VisualBounds {
  return { left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y) };
}

type Props = {
  source: Blob;
  page: number;
  excerpt?: SourceCrop;
  initial?: QuestionVisual;
  disabled?: boolean;
  onSave: (visual: QuestionVisual) => void;
};

export function CropDialog({ source, page, excerpt, initial, disabled, onSave }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<CropFields>(() => asFields({ left: 0.08, right: 0.92, top: 0.08, bottom: 0.92 }));
  const [drag, setDrag] = useState<VisualBounds>();
  const start = useRef<{ id: number; point: Point } | null>(null);
  const imageRef = useImageBlob(source);
  const bounds = readFields(fields);
  const selection = drag ?? bounds;

  function changeOpen(next: boolean) {
    if (busy) return;
    if (next) {
      start.current = null;
      setFields(asFields(initial?.bounds ?? { left: 0.08, right: 0.92, top: excerpt?.top ?? 0.08, bottom: excerpt?.bottom ?? 0.92 }));
      setDescription(initial?.description ?? "");
      setDrag(undefined);
      setError("");
    }
    setOpen(next);
  }

  async function save() {
    if (!bounds || !description.trim() || busy) return;
    setError("");
    setBusy(true);
    try {
      const image = await cropSource(source, bounds);
      onSave({ page, bounds, image, description: description.trim() });
      setOpen(false);
    } catch {
      setError("Couldn’t crop this image. Try again.");
    } finally { setBusy(false); }
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild>
      <Button variant={initial ? "ghost" : "outline"} size="sm" disabled={disabled}>
        {!initial && <HugeiconsIcon icon={CropIcon} strokeWidth={1.5} aria-hidden="true" />}
        {initial ? "Adjust crop" : "Crop visual"}
      </Button>
    </DialogTrigger>
    <DialogContent aria-describedby={undefined} className="max-h-[calc(100svh-2rem)] max-w-[min(54rem,calc(100%-2rem))] gap-4 overflow-y-auto sm:max-w-[min(54rem,calc(100%-2rem))]">
      <DialogHeader><DialogTitle>Crop visual · Page {page}</DialogTitle></DialogHeader>
      <form className="min-w-0 space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_13rem]">
          <div className="flex min-h-24 min-w-0 items-start justify-center rounded-lg bg-muted/50 p-2">
            <div
              className="relative w-fit max-w-full touch-none cursor-crosshair overflow-hidden rounded-sm"
              onPointerDown={event => {
                if (event.button !== 0 || start.current || busy) return;
                const point = pointAt(event);
                if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
                start.current = { id: event.pointerId, point };
                event.currentTarget.setPointerCapture(event.pointerId);
                setDrag(between(point, point));
              }}
              onPointerMove={event => {
                if (start.current?.id === event.pointerId) setDrag(between(start.current.point, pointAt(event)));
              }}
              onPointerUp={event => {
                if (start.current?.id !== event.pointerId) return;
                const next = asFields(between(start.current.point, pointAt(event)));
                if (readFields(next)) setFields(next);
                start.current = null;
                setDrag(undefined);
              }}
              onLostPointerCapture={() => { start.current = null; setDrag(undefined); }}
            >
              <img draggable={false} ref={imageRef} alt={`Original page ${page}`} className="pointer-events-none block h-auto max-h-[58svh] w-auto max-w-full select-none bg-white" />
              {selection && <div aria-hidden="true" className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_100vmax_rgb(0_0_0/0.55)]"
                style={{ left: `${selection.left * 100}%`, top: `${selection.top * 100}%`, width: `${(selection.right - selection.left) * 100}%`, height: `${(selection.bottom - selection.top) * 100}%` }} />}
            </div>
          </div>
          <div className="min-w-0 space-y-4">
            <Field><FieldLabel htmlFor={`${id}-description`}>Image description</FieldLabel>
              <Input id={`${id}-description`} value={description} onChange={event => setDescription(event.target.value)} maxLength={180} required disabled={busy} dir="auto" />
            </Field>
            <fieldset className="grid grid-cols-2 gap-2">
              <legend className="mb-2 text-sm font-medium">Crop bounds (%)</legend>
              {edges.map(edge => <Field key={edge} className="gap-1">
                <FieldLabel htmlFor={`${id}-${edge}`} className="capitalize">{edge}</FieldLabel>
                <Input id={`${id}-${edge}`} type="number" min={0} max={100} step={0.1} required disabled={busy} value={fields[edge]} onChange={event => setFields(prev => ({ ...prev, [edge]: event.target.value }))} />
              </Field>)}
            </fieldset>
            {!bounds && <p role="status" className="text-sm text-destructive">Select an area at least 1% wide and high.</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="outline" disabled={busy}>Cancel</Button></DialogClose>
          <Button type="submit" disabled={!bounds || !description.trim() || busy}>{busy ? "Cropping…" : initial ? "Save crop" : "Attach image"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
