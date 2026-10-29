/**
 * The shared named color palette for color-coded features (labels first). Records store only these
 * keys; the appearances below are the one source of the actual colors, so refining a shade here
 * updates every use without rewriting records. Each entry has coordinated light and dark
 * appearances. Keep keys stable: the database allowlists them (labels_color_check).
 *
 * Classes are written out in full so Tailwind finds them. Badge text uses the 800/200 shades on
 * 100/950 backgrounds, which keeps contrast well above WCAG AA in both themes.
 */
export const PALETTE = {
  gray: { name: "Gray", foreground: "text-zinc-800 dark:text-zinc-200", background: "bg-zinc-100 dark:bg-zinc-800/70", border: "border-zinc-300 dark:border-zinc-700", indicator: "bg-zinc-500 dark:bg-zinc-400" },
  red: { name: "Red", foreground: "text-red-800 dark:text-red-200", background: "bg-red-100 dark:bg-red-950/70", border: "border-red-200 dark:border-red-900", indicator: "bg-red-500 dark:bg-red-400" },
  orange: { name: "Orange", foreground: "text-orange-800 dark:text-orange-200", background: "bg-orange-100 dark:bg-orange-950/70", border: "border-orange-200 dark:border-orange-900", indicator: "bg-orange-500 dark:bg-orange-400" },
  amber: { name: "Amber", foreground: "text-amber-800 dark:text-amber-200", background: "bg-amber-100 dark:bg-amber-950/70", border: "border-amber-200 dark:border-amber-900", indicator: "bg-amber-500 dark:bg-amber-400" },
  green: { name: "Green", foreground: "text-green-800 dark:text-green-200", background: "bg-green-100 dark:bg-green-950/70", border: "border-green-200 dark:border-green-900", indicator: "bg-green-600 dark:bg-green-400" },
  teal: { name: "Teal", foreground: "text-teal-800 dark:text-teal-200", background: "bg-teal-100 dark:bg-teal-950/70", border: "border-teal-200 dark:border-teal-900", indicator: "bg-teal-600 dark:bg-teal-400" },
  blue: { name: "Blue", foreground: "text-blue-800 dark:text-blue-200", background: "bg-blue-100 dark:bg-blue-950/70", border: "border-blue-200 dark:border-blue-900", indicator: "bg-blue-500 dark:bg-blue-400" },
  indigo: { name: "Indigo", foreground: "text-indigo-800 dark:text-indigo-200", background: "bg-indigo-100 dark:bg-indigo-950/70", border: "border-indigo-200 dark:border-indigo-900", indicator: "bg-indigo-500 dark:bg-indigo-400" },
  violet: { name: "Violet", foreground: "text-violet-800 dark:text-violet-200", background: "bg-violet-100 dark:bg-violet-950/70", border: "border-violet-200 dark:border-violet-900", indicator: "bg-violet-500 dark:bg-violet-400" },
  pink: { name: "Pink", foreground: "text-pink-800 dark:text-pink-200", background: "bg-pink-100 dark:bg-pink-950/70", border: "border-pink-200 dark:border-pink-900", indicator: "bg-pink-500 dark:bg-pink-400" },
} as const;

export type PaletteKey = keyof typeof PALETTE;
export const PALETTE_KEYS = Object.keys(PALETTE) as PaletteKey[];

export const isPaletteKey = (value: unknown): value is PaletteKey => typeof value === "string" && Object.hasOwn(PALETTE, value);

/** Foreground, background and border together: a readable badge or chip. */
export const paletteChip = (key: PaletteKey) => `${PALETTE[key].foreground} ${PALETTE[key].background} ${PALETTE[key].border}`;
