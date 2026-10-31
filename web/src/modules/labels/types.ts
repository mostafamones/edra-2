import type { PaletteKey } from "@/lib/palette";

/** Each module has its own catalog in an academy; labels never cross between them. */
export const LABEL_DOMAINS = ["assessments", "content"] as const;
export type LabelDomain = (typeof LABEL_DOMAINS)[number];

/** One entry of a staff-only label catalog. `color` is a palette key, never a color value. */
export type Label = { id: string; name: string; color: PaletteKey };

export type LabelErrorCode = "validation" | "forbidden" | "not_found" | "label_not_found" | "duplicate_name" | "unavailable";
export type LabelFailure = { ok: false; code: LabelErrorCode; message: string };
export type LabelResult = { ok: true; label: Label } | LabelFailure;
/** `deleted: false` means the label is used and nothing changed: confirm with the authoritative use count. */
export type DeleteLabelResult = { ok: true; deleted: true } | { ok: true; deleted: false; uses: number } | LabelFailure;
