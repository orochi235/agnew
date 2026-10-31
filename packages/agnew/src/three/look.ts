import type { Curve, Design } from '../design.js';
import { AUTO } from '../params.js';
import { autoBloom, autoLineOpacity, autoLineWidth, coverage } from './auto.js';
import { neonExposure } from './build.js';
import type { Box } from './framing.js';
import type { ViewSettings } from './settings.js';

/** Line width, opacity and bloom for `curve` in `frame`, with any `'auto'` worked out. */
export function resolveLook(
  s: ViewSettings,
  frame: Box,
  curve: Curve | null,
): { lineWidth: number; lineOpacity: number; bloom: number } {
  const lineWidth = s.lineWidth === AUTO ? autoLineWidth(frame) : s.lineWidth;
  const cover = curve ? coverage(curve, frame, lineWidth) : 1;
  const lineOpacity =
    s.lineOpacity === AUTO
      ? autoLineOpacity(s.style, cover)
      : s.style === 'neon' && curve
        ? s.lineOpacity * neonExposure(curve)
        : s.lineOpacity;
  const bloom = s.bloom === AUTO ? autoBloom(s.style, cover) : s.bloom;
  return { lineWidth, lineOpacity, bloom };
}

/** Whether anything in the settings or the design is worked out from the frame. */
export function usesAuto(s: ViewSettings, design: Design | null): boolean {
  if (s.lineWidth === AUTO || s.lineOpacity === AUTO || s.bloom === AUTO) return true;
  if (s.azimuth === AUTO || s.elevation === AUTO) return true;
  return !!design?.blocks.some((b) => Object.values(b.params).includes(AUTO));
}

/** A change from `prev` to `next` that the built curve's geometry or materials depend on. */
export function needsRebuild(prev: ViewSettings, next: ViewSettings): boolean {
  return (
    next.style !== prev.style ||
    next.palette !== prev.palette ||
    next.lineWidth !== prev.lineWidth ||
    next.lineOpacity !== prev.lineOpacity ||
    next.tubeRadius !== prev.tubeRadius ||
    next.ribbonWidth !== prev.ribbonWidth ||
    next.ribbonTwist !== prev.ribbonTwist ||
    next.gpu !== prev.gpu ||
    next.layers.curve !== prev.layers.curve ||
    next.layers.trace !== prev.layers.trace
  );
}

/** A change from `prev` to `next` to the frame's shape or the curve's stretch into it. */
export function reshapes(prev: ViewSettings, next: ViewSettings): boolean {
  return (
    next.shape !== prev.shape ||
    next.stretch !== prev.stretch ||
    next.ratioW !== prev.ratioW ||
    next.ratioH !== prev.ratioH
  );
}
