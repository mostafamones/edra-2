import type { SourceCrop } from "./parser";
import { cropQuality } from "./crop-quality";

export type VisualBounds = SourceCrop & { left: number; right: number };
export type QuestionVisual = { page: number; bounds: VisualBounds; description: string; image: Blob };

export async function assessSuggestedCrop(image: Blob): Promise<string | undefined> {
  const bitmap = await createImageBitmap(image);
  const canvas = document.createElement("canvas");
  try {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image crop unavailable");
    context.drawImage(bitmap, 0, 0);
    const result = cropQuality(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    if (result === "empty") return "A suggested figure crop was blank and was not attached. Crop the figure from the original page.";
    if (result === "clipped") return "A suggested figure crop may cut through text or a diagram and was not attached. Crop the full figure from the original page.";
  } finally { bitmap.close(); canvas.width = 0; canvas.height = 0; }
}

export async function cropSource(image: Blob, crop: SourceCrop & Partial<VisualBounds>): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  const canvas = document.createElement("canvas");
  try {
    const left = Math.floor(bitmap.width * (crop.left ?? 0));
    const right = Math.ceil(bitmap.width * (crop.right ?? 1));
    const top = Math.floor(bitmap.height * crop.top);
    const bottom = Math.ceil(bitmap.height * crop.bottom);
    canvas.width = Math.max(1, right - left);
    canvas.height = Math.max(1, bottom - top);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image crop unavailable");
    context.drawImage(bitmap, left, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Image crop unavailable")), "image/jpeg", 0.92),
    );
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function sourceDataUrl(image: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Invalid source image"));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(image);
  });
}

export async function fitPageImage(image: Blob, limit: number): Promise<Blob | undefined> {
  if (image.size <= limit) return image;
  const bitmap = await createImageBitmap(image);
  const canvas = document.createElement("canvas");
  try {
    // Keep the page geometry and resolution for small Arabic letters and exponents.
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(bitmap, 0, 0);
    for (const quality of [0.82, 0.74, 0.66]) {
      const candidate = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      if (candidate && candidate.size <= limit) return candidate;
    }
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
