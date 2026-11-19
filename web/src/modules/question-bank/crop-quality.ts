/** A conservative pixel check, not proof that the model selected the right semantic block. */
export function cropQuality(pixels: Uint8ClampedArray, width: number, height: number): "empty" | "clipped" | "clear" {
  const ink = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return pixels[i + 3] > 16 && Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 205;
  };
  let count = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (ink(x, y)) count++;
  if (count < 8) return "empty";
  if (width < 8 || height < 8) return "clipped";
  const edge = (length: number, at: (position: number, depth: number) => boolean) => {
    let hits = 0;
    for (let p = 0; p < length; p++) if (at(p, 0) || at(p, 1)) hits++;
    const ratio = hits / length;
    // A continuous frame is legitimate; scattered ink at an edge can be cut text or a diagram.
    return ratio > 0.025 && ratio < 0.8;
  };
  return edge(height, (p, d) => ink(d, p)) || edge(height, (p, d) => ink(width - 1 - d, p))
    || edge(width, (p, d) => ink(p, d)) || edge(width, (p, d) => ink(p, height - 1 - d)) ? "clipped" : "clear";
}
