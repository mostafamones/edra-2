import { z } from "zod";

import { isPaletteKey, type PaletteKey } from "@/lib/palette";
import type { Label } from "./types";

export const LABEL_NAME_MAX = 40;
/** Trimmed, 1–40 characters, no control characters; the database checks the same. */
export const labelNameSchema = z.string().trim().min(1).max(LABEL_NAME_MAX).regex(/^[^\p{Cc}]*$/u);
export const labelColorSchema = z.custom<PaletteKey>(isPaletteKey);

export const labelSchema = z.object({
  id: z.string(),
  name: z.string(),
  // A key later removed from the palette still shows, in gray, rather than failing the catalog.
  color: z.string().transform((color): PaletteKey => isPaletteKey(color) ? color : "gray"),
});

export const toLabel = (value: unknown): Label => labelSchema.parse(value);
export const toLabels = (value: unknown): Label[] => z.array(labelSchema).parse(value)
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id));
