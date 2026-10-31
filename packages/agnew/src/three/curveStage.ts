import type { Group, Texture } from 'three';
import { arcLengths } from '../arclength.js';
import type { EvalContext } from '../blocks.js';
import { type Curve, type Design, evaluate, sampleCount } from '../design.js';
import { type Built, buildCurve } from './build.js';
import { curveProgram } from './glsl.js';
import type { ViewSettings } from './settings.js';

/** Points in the curve the pen and trace measure distance along, while the
 *  drawn line is evaluated on the GPU. */
const PEN_SAMPLES = 2000;

const onGpu = (s: ViewSettings) => s.gpu && (s.style === 'neon' || s.style === 'ink');

/** The curve as built into `curveGroup` and `traceGroup`, and the pen's path along it. */
export function createCurveStage(curveGroup: Group, traceGroup: Group) {
  /** The curve as last fully built, which framing and the automatic look read. */
  let curve: Curve | null = null;
  /** The design fixed at the moment last drawn. */
  let moment: Design | null = null;
  let built: Built | null = null;
  /** Samples of the last full build, kept while the curve moves so its geometry keeps its size. */
  let samples = 2;
  /** Cumulative arc length along the curve the pen follows. */
  let cum: Float64Array = new Float64Array(1);
  let version = 0;

  function clear() {
    if (!built) return;
    for (const o of built.objects) o.removeFromParent();
    for (const m of built.materials) m.dispose();
    for (const g of built.geometries) g.dispose();
    built = null;
  }

  return {
    get curve() {
      return curve;
    },
    get moment() {
      return moment;
    },
    get built() {
      return built;
    },
    get cum() {
      return cum;
    },
    /** Bumped by every full build. */
    get version() {
      return version;
    },
    clear,
    /** Builds `at` afresh. `lookFor` sees the new curve before its lines are
     *  made, and says how wide and opaque to draw them. */
    build(
      at: Design,
      ctx: EvalContext,
      settings: ViewSettings,
      envMap: Texture,
      lookFor: (c: Curve) => { lineWidth: number; lineOpacity: number },
    ) {
      clear();
      moment = at;
      samples = sampleCount(at, ctx);
      curve = evaluate({ ...at, samples }, ctx);
      version += 1;
      cum = arcLengths(curve.positions, curve.count);
      const { lineWidth, lineOpacity } = lookFor(curve);
      const out = buildCurve({
        curve,
        program: onGpu(settings) ? curveProgram(at, ctx) : undefined,
        settings,
        lineWidth,
        lineOpacity,
        envMap,
      });
      curveGroup.add(out.full);
      traceGroup.add(out.trace);
      built = out.built;
    },
    /** Redraws the built curve at `at`, keeping what the last full build worked
     *  out. False when the curve has changed past what a redraw can follow, and
     *  needs building afresh. */
    move(at: Design, ctx: EvalContext): boolean {
      if (!built) return true;
      moment = at;
      if (built.gpu) {
        const program = curveProgram(at, ctx);
        if (program.key !== built.gpu.key) return false;
        built.gpu.update(program);
        const pen = evaluate({ ...at, samples: Math.min(samples, PEN_SAMPLES) }, ctx);
        cum = arcLengths(pen.positions, pen.count);
      } else {
        const next = evaluate({ ...at, samples }, ctx);
        built.reshape(next);
        cum = arcLengths(next.positions, next.count);
      }
      return true;
    },
  };
}
