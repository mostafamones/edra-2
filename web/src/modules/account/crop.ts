/**
 * Geometry for the square avatar crop. The image covers a square viewport at zoom 1 and is moved
 * by `offset`, the image centre's displacement from the viewport centre in viewport pixels. The
 * circular preview is the viewport's inscribed circle, so it matches the saved square exactly.
 */
export type Size = { width: number; height: number };
export type Point = { x: number; y: number };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

function baseScale(image: Size, viewport: number) {
  return viewport / Math.min(image.width, image.height);
}

/** Keeps the image covering the whole viewport. */
export function clampOffset(offset: Point, image: Size, viewport: number, zoom: number): Point {
  const scale = baseScale(image, viewport) * zoom;
  const maxX = (image.width * scale - viewport) / 2;
  const maxY = (image.height * scale - viewport) / 2;
  return { x: Math.min(maxX, Math.max(-maxX, offset.x)), y: Math.min(maxY, Math.max(-maxY, offset.y)) };
}

/** Changes zoom around the viewport centre. */
export function zoomOffset(offset: Point, image: Size, viewport: number, from: number, to: number): Point {
  const ratio = to / from;
  return clampOffset({ x: offset.x * ratio, y: offset.y * ratio }, image, viewport, to);
}

/** The square region of the source image, in image pixels, that the viewport shows. */
export function cropRect(image: Size, viewport: number, zoom: number, offset: Point) {
  const scale = baseScale(image, viewport) * zoom;
  const clamped = clampOffset(offset, image, viewport, zoom);
  const side = viewport / scale;
  return {
    x: image.width / 2 - clamped.x / scale - side / 2,
    y: image.height / 2 - clamped.y / scale - side / 2,
    side,
  };
}

/** CSS size and top-left position of the image inside the viewport. */
export function imageLayout(image: Size, viewport: number, zoom: number, offset: Point) {
  const scale = baseScale(image, viewport) * zoom;
  const width = image.width * scale;
  const height = image.height * scale;
  return { width, height, left: (viewport - width) / 2 + offset.x, top: (viewport - height) / 2 + offset.y };
}
