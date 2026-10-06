import type { Curve } from '../design.js';
import type { Box } from './framing.js';
import type { Style } from './view.js';

/** Line width in CSS pixels for a frame: thin in a strip a few dozen pixels
 *  tall, up to the usual weight in a full window. */
export function autoLineWidth(frame: Box): number {
  const short = Math.min(frame.width, frame.height);
  return Math.min(2, Math.max(0.6, 0.5 + short / 400));
}

/**
 * About how many times over the curve's lines would cover the frame: its
 * length in pixels, at the scale that fits its bounds in the frame, times the
 * line width, over the frame's area. Ignores where lines overlap, which is
 * the point: dense curves pile up and need dimming.
 */
export function coverage(curve: Curve, frame: Box, lineWidth: number): number {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  const { positions, count } = curve;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const fallback = 2 * Math.max(curve.radius, 1e-6);
  const w = x1 > x0 ? x1 - x0 : fallback;
  const h = y1 > y0 ? y1 - y0 : fallback;
  const pxPerUnit = Math.min(frame.width / w, frame.height / h);
  return (curve.length * pxPerUnit * lineWidth) / Math.max(1, frame.width * frame.height);
}

const BASE_OPACITY: Record<Style, number> = { neon: 0.8, ink: 0.95, tube: 1, ribbon: 1 };
const BASE_BLOOM: Record<Style, number> = { neon: 0.9, ink: 0, tube: 0.15, ribbon: 0.2 };

/** Line opacity that keeps a dense curve from burning out: the style's usual
 *  opacity, dimmed as coverage climbs past about once over. */
export function autoLineOpacity(style: Style, cover: number): number {
  return Math.max(0.03, BASE_OPACITY[style] * Math.min(1, (0.8 / Math.max(cover, 1e-6)) ** 0.7));
}

/** Bloom strength: the style's usual amount, eased off as coverage climbs. */
export function autoBloom(style: Style, cover: number): number {
  return BASE_BLOOM[style] * Math.min(1, (1 / Math.max(cover, 1e-6)) ** 0.5);
}
