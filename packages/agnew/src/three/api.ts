import type { Design } from '../design.js';
import type { RecordOptions } from './export.js';
import type { ViewSettings } from './settings.js';

/** A live view of one design: what `createAgnewView` returns. */
export interface AgnewView {
  setDesign(design: Design): void;
  setSettings(patch: Partial<ViewSettings>): void;
  readonly settings: ViewSettings;
  /** Move the camera so the whole curve is in view, keeping its direction. */
  fit(): void;
  /** Fly the camera and its target together, in camera space: `right`, `up`
   *  and `forward` are in multiples of the curve's radius. */
  fly(right: number, up: number, forward: number): void;
  /** The camera angle that lets a tight fit fill the current frame most. */
  bestAngle(): { azimuth: number; elevation: number };
  /** The settings that may be `'auto'`, as the numbers in use right now. */
  resolved(): { lineWidth: number; lineOpacity: number; bloom: number; azimuth: number; elevation: number };
  /** Back to the start of the loop. */
  restartTrace(): void;
  /** Whether the clock, and with it the pen, any motion and auto-rotation, is running. */
  playing: boolean;
  /** How far through the design's loop the clock is, 0–1. Setting it moves
   *  the clock there. */
  progress: number;
  /**
   * Compose for a box smaller than the canvas, in CSS pixels. The picture
   * keeps the position and scale it had at that size and the canvas paints
   * past it — which is how art runs under a translucent panel without the
   * framing moving. Exports and recordings still cover the framed box only.
   * The box is placed at `x`, `y` in the canvas, its top left by default.
   */
  setFraming(box: { width: number; height: number; x?: number; y?: number } | null): void;
  /** A PNG of the current frame at `scale` times the on-screen resolution,
   *  rendered in tiles so large sizes work on any GPU. */
  exportPNG(scale?: number): Promise<Blob>;
  /** A WebM of the canvas for `seconds`. */
  record(seconds: number, options?: RecordOptions): Promise<Blob>;
  dispose(): void;
}
