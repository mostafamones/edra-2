"use client";

import { useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon, ZoomInAreaIcon, ZoomOutAreaIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";

import { MAX_ZOOM, MIN_ZOOM, clampOffset, cropRect, imageLayout, zoomOffset, type Point, type Size } from "../crop";

const VIEWPORT = 280;
const OUTPUT = 512;
const STEP = 10;
const ZOOM_STEP = 0.1;

export type CropSource = { url: string; bitmap: ImageBitmap };

/** Draws the chosen square at the stored size. Corners stay opaque; the circle is only a preview mask. */
async function renderCrop(source: CropSource, zoom: number, offset: Point): Promise<Blob> {
  const image = { width: source.bitmap.width, height: source.bitmap.height };
  const rect = cropRect(image, VIEWPORT, zoom, offset);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, OUTPUT, OUTPUT);
  context.imageSmoothingQuality = "high";
  context.drawImage(source.bitmap, rect.x, rect.y, rect.side, rect.side, 0, 0, OUTPUT, OUTPUT);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
  if (!blob) throw new Error("encode_failed");
  // Browsers without WebP encoding return PNG; the server re-encodes either way.
  return blob;
}

export function CropDialog({ source, saving, onCancel, onSave }: {
  source: CropSource | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (blob: Blob) => void;
}) {
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ pointer: number; start: Point; origin: Point } | null>(null);
  const [current, setCurrent] = useState(source);

  // Reset the editor for each newly selected source.
  if (current !== source) {
    setCurrent(source);
    setZoom(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });
    setError(null);
  }

  const image: Size = source ? { width: source.bitmap.width, height: source.bitmap.height } : { width: 1, height: 1 };
  const layout = imageLayout(image, VIEWPORT, zoom, offset);

  function changeZoom(next: number) {
    const value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    setOffset((previous) => zoomOffset(previous, image, VIEWPORT, zoom, value));
    setZoom(value);
  }

  function move(next: Point) {
    setOffset(clampOffset(next, image, VIEWPORT, zoom));
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const moves: Record<string, Point> = {
      ArrowLeft: { x: STEP, y: 0 }, ArrowRight: { x: -STEP, y: 0 }, ArrowUp: { x: 0, y: STEP }, ArrowDown: { x: 0, y: -STEP },
    };
    if (moves[event.key]) {
      event.preventDefault();
      move({ x: offset.x + moves[event.key].x, y: offset.y + moves[event.key].y });
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      changeZoom(zoom + ZOOM_STEP);
    } else if (event.key === "-") {
      event.preventDefault();
      changeZoom(zoom - ZOOM_STEP);
    }
  }

  async function save() {
    if (!source) return;
    setError(null);
    try {
      onSave(await renderCrop(source, zoom, offset));
    } catch {
      setError("Couldn’t prepare this image. Try another one.");
    }
  }

  return (
    <Dialog open={Boolean(source)} onOpenChange={(open) => { if (!open && !saving) onCancel(); }}>
      <DialogContent className="sm:max-w-sm" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>Edit picture</DialogTitle>
        </DialogHeader>
        <div
          role="group"
          tabIndex={0}
          aria-label="Picture position"
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight + -"
          className="relative mx-auto touch-none overflow-hidden rounded-lg bg-muted outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 cursor-grab active:cursor-grabbing"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onKeyDown={onKeyDown}
          onWheel={(event) => changeZoom(zoom - Math.sign(event.deltaY) * ZOOM_STEP)}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: offset };
          }}
          onPointerMove={(event) => {
            const active = drag.current;
            if (!active || active.pointer !== event.pointerId) return;
            move({ x: active.origin.x + event.clientX - active.start.x, y: active.origin.y + event.clientY - active.start.y });
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
        >
          {source && (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img
              src={source.url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{ width: layout.width, height: layout.height, left: layout.left, top: layout.top }}
            />
          )}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgb(0_0_0/0.55)] ring-2 ring-white/80" />
        </div>
        <div className="flex items-center gap-3">
          <HugeiconsIcon icon={ZoomOutAreaIcon} strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Slider
            // The shadcn slider forwards no label to its thumb, which Radix renders after mount; name it.
            ref={(node: HTMLSpanElement | null) => {
              if (node) requestAnimationFrame(() => node.querySelector('[role="slider"]')?.setAttribute("aria-label", "Zoom"));
            }}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={[zoom]}
            onValueChange={([value]) => changeZoom(value)}
            disabled={saving}
          />
          <HugeiconsIcon icon={ZoomInAreaIcon} strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !source}>
            {saving && <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
