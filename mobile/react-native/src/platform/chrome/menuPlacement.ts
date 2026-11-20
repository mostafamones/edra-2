export type Rect = { x: number; y: number; width: number; height: number }

// Minimum margin between the popup and the screen edges, safe areas and keyboard.
const GAP = 8

/**
 * Places the selector popup over its pill: top edge on the pill's top when it fits below, otherwise bottom edge on
 * the pill's bottom so it grows upward. Edges clamp inside the safe area and keyboard; long lists scroll in maxHeight.
 */
export function placeMenu(anchor: Rect, window: { width: number; height: number }, safeTop: number, floor: number) {
  const safeStart = safeTop + GAP
  const safeEnd = Math.max(safeStart, floor - GAP)
  const top = Math.min(Math.max(anchor.y, safeStart), safeEnd)
  const bottom = Math.max(Math.min(anchor.y + anchor.height, safeEnd), safeStart)
  const below = safeEnd - top
  const above = bottom - safeStart
  const down = below >= Math.min(above, 240)
  const width = Math.min(Math.max(anchor.width, 220), window.width - 2 * GAP)
  const left = Math.min(Math.max(anchor.x, GAP), window.width - GAP - width)
  return {
    left, width,
    maxHeight: down ? below : above,
    ...(down ? { top } : { bottom: window.height - bottom }),
  }
}
