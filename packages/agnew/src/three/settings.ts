import { AUTO, type Auto } from '../params.js';
import type { ColorFilter } from './color.js';
import type { FitMode, Shape } from './framing.js';
import type { AutoRotate } from './rotation.js';

export type Style = 'neon' | 'tube' | 'ink' | 'ribbon';
export const STYLES: readonly Style[] = ['neon', 'tube', 'ink', 'ribbon'];

export interface ViewSettings {
  style: Style;
  /** A key of `PALETTES`. */
  palette: string;
  background: string;
  /** Line width in CSS pixels (neon, ink), or `'auto'` to suit the frame. */
  lineWidth: number | Auto;
  /** Line opacity. In neon it is additive and scaled down for dense curves
   *  (long relative to their size), so a harmonograph's core does not burn out. */
  lineOpacity: number | Auto;
  /** Tube radius as a fraction of the curve's radius. */
  tubeRadius: number;
  /** Ribbon width as a fraction of the curve's radius. */
  ribbonWidth: number;
  /** Full turns of the ribbon's face along the whole curve. */
  ribbonTwist: number;
  /** Bloom strength; 0 turns the pass off. */
  bloom: number | Auto;
  layers: { curve: boolean; trace: boolean; mechanism: boolean };
  /** How far the pen travels per second, in multiples of the curve's radius.
   *  The pen moves at this speed along the line, so a longer, more complex
   *  curve takes longer to draw. */
  traceSpeed: number;
  autoRotate: AutoRotate;
  /** How `fit()` frames the curve. */
  fit: FitMode;
  /** Camera direction around the vertical, in degrees; 0 looks from +z.
   *  `'auto'` on either angle turns to whichever fills the frame most. */
  azimuth: number | Auto;
  /** Camera height above the horizon, in degrees. At 0 with azimuth 0 the
   *  x axis runs straight across the frame. */
  elevation: number | Auto;
  /** The frame's shape, centered in the framed area; `free` fills it. */
  shape: Shape;
  /** The frame's width : height when `shape` is `custom`. */
  ratioW: number;
  ratioH: number;
  /** Stretch the curve toward the shape's aspect before framing it. */
  stretch: boolean;
  /** Hue rotation of the finished picture, in degrees. */
  hue: number;
  /** A color treatment of the finished picture; see `COLOR_FILTERS`. */
  filter: ColorFilter;
}

/** What switching to a style should also change, so each one opens looking right. */
export const STYLE_DEFAULTS: Readonly<Record<Style, Partial<ViewSettings>>> = {
  neon: { palette: 'aurora', background: '#05060a', bloom: AUTO, lineWidth: AUTO, lineOpacity: AUTO },
  tube: { palette: 'brass', background: '#0e1016', bloom: AUTO },
  ink: { palette: 'ink', background: '#f3eee3', bloom: AUTO, lineWidth: AUTO, lineOpacity: AUTO },
  ribbon: { palette: 'ice', background: '#0c0a14', bloom: AUTO },
};

export const DEFAULT_VIEW: ViewSettings = {
  style: 'neon',
  palette: 'aurora',
  background: '#05060a',
  lineWidth: AUTO,
  lineOpacity: AUTO,
  tubeRadius: 0.012,
  ribbonWidth: 0.035,
  ribbonTwist: 40,
  bloom: AUTO,
  layers: { curve: true, trace: false, mechanism: false },
  traceSpeed: 4,
  autoRotate: 'orbit',
  fit: 'orbit',
  azimuth: 19,
  elevation: 15,
  shape: 'free',
  ratioW: 30,
  ratioH: 1,
  stretch: false,
  hue: 0,
  filter: 'none',
};

export function numberOr(v: number | Auto, fallback: number): number {
  return v === AUTO ? fallback : v;
}
