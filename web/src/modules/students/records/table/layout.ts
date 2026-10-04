/**
 * The table always fills its container exactly. Fixed columns (selection, actions) keep their width;
 * data column sizes act as weights that share the remaining space.
 */
export type LayoutColumn = { size: number; fixed: boolean };

export type FittedWidths = {
  /** Rendered pixel widths, in column order, summing to the available width. */
  widths: number[];
  /** Rendered pixels per unit of data column size. */
  scale: number;
};

export function fitWidths(columns: LayoutColumn[], available: number): FittedWidths {
  const fixed = columns.reduce((sum, column) => sum + (column.fixed ? column.size : 0), 0);
  const weights = columns.reduce((sum, column) => sum + (column.fixed ? 0 : column.size), 0);
  if (weights <= 0) return { widths: columns.map((column) => column.size), scale: 1 };

  const space = Math.max(0, Math.floor(available) - fixed);
  const scale = space / weights;
  const widths = columns.map((column) => (column.fixed ? column.size : Math.floor(column.size * scale)));
  // Rounding leftovers go to the last data column so the widths add up exactly.
  const last = columns.findLastIndex((column) => !column.fixed);
  widths[last] += space - widths.reduce((sum, width, index) => sum + (columns[index].fixed ? 0 : width), 0);
  return { widths, scale };
}

export type SizedColumn = { size: number; minSize: number; maxSize: number };

/**
 * Clamps a size change moved from `next` to `column`, so the boundary between two neighbours moves
 * while every other column, and the total, stay put.
 */
export function clampTrade(column: SizedColumn, next: SizedColumn, delta: number) {
  const low = Math.max(column.minSize - column.size, next.size - next.maxSize);
  const high = Math.min(column.maxSize - column.size, next.size - next.minSize);
  if (low > high) return 0;
  return Math.min(high, Math.max(low, delta));
}
