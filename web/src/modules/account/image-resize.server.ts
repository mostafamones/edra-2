import "@tanstack/react-start/server-only";
import type { Pixels } from "./image-codecs.server";

function coefficients(source: number, destination: number) {
  const scale = source / destination, filterScale = Math.max(1, scale), radius = 3 * filterScale;
  const sinc = (value: number) => value === 0 ? 1 : Math.sin(Math.PI * value) / (Math.PI * value);
  return Array.from({ length: destination }, (_, index) => {
    const center = (index + 0.5) * scale - 0.5;
    const start = Math.max(0, Math.ceil(center - radius)), end = Math.min(source - 1, Math.floor(center + radius));
    const weights = new Float64Array(end - start + 1);
    let total = 0;
    for (let at = start; at <= end; at++) {
      const distance = Math.abs(at - center) / filterScale;
      total += weights[at - start] = distance < 3 ? sinc(distance) * sinc(distance / 3) : 0;
    }
    for (let at = 0; at < weights.length; at++) weights[at] /= total;
    return { start, weights };
  });
}

/** Separable Lanczos3 on the opaque crop, retaining only the rows the next output row needs. */
export function resizeOpaque(pixels: Pixels, size: number): Pixels {
  const horizontal = coefficients(pixels.width, size), vertical = coefficients(pixels.height, size);
  const output = new Uint8ClampedArray(size * size * 4);
  const rows = new Map<number, Float64Array>();
  const pool: Float64Array[] = [];
  const accumulated = new Float64Array(size * 3);
  for (let y = 0; y < size; y++) {
    const { start, weights } = vertical[y];
    for (const [index, row] of rows) if (index < start) { pool.push(row); rows.delete(index); }
    for (let row = start; row < start + weights.length; row++) {
      if (rows.has(row)) continue;
      const filtered = pool.pop() ?? new Float64Array(size * 3);
      for (let x = 0; x < size; x++) {
        const { start: first, weights: taps } = horizontal[x];
        let red = 0, green = 0, blue = 0;
        for (let tap = 0; tap < taps.length; tap++) {
          const at = (row * pixels.width + first + tap) * 4, weight = taps[tap];
          red += pixels.data[at] * weight;
          green += pixels.data[at + 1] * weight;
          blue += pixels.data[at + 2] * weight;
        }
        filtered[x * 3] = red; filtered[x * 3 + 1] = green; filtered[x * 3 + 2] = blue;
      }
      rows.set(row, filtered);
    }
    accumulated.fill(0);
    for (let tap = 0; tap < weights.length; tap++) {
      const row = rows.get(start + tap)!, weight = weights[tap];
      for (let at = 0; at < accumulated.length; at++) accumulated[at] += row[at] * weight;
    }
    for (let x = 0; x < size; x++) {
      const at = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) output[at + channel] = accumulated[x * 3 + channel];
      output[at + 3] = 255;
    }
  }
  return { data: output, width: size, height: size };
}
