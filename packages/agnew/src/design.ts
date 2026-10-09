import { blockKind, type EvalContext } from './blocks.js';
import { AUTO, type Auto, defaultParams, type ParamValues } from './params.js';
import type { Motion } from './motion.js';
import type { Vec3 } from './vec.js';

export interface Block {
  id: string;
  kind: string;
  enabled: boolean;
  params: ParamValues;
  /** Number params that move over the loop, by key. */
  motion?: Record<string, Motion>;
}

/** Another curve this design blends toward, point by point at the same
 *  fraction along each. */
export interface Morph {
  to: { blocks: Block[]; turns: number };
  /** 0 is this design's curve, 1 the other's. */
  weight: number;
  motion?: Motion;
}

/** Everything that determines the curve. Plain data: safe to serialize. */
export interface Design {
  version: 2;
  blocks: Block[];
  /** How many base cycles (2π of time) the curve runs for. */
  turns: number;
  /** Points sampled along the whole curve, or `'auto'` for enough that each
   *  segment is short beside the curve's size; see `sampleCount`. */
  samples: number | Auto;
  /** Seconds one loop lasts: the transport's length, and what every motion repeats over. */
  loop: number;
  /** Times the pen draws the curve per loop. */
  passes: number;
  morph?: Morph;
}

let nextId = 0;
export function newBlockId(): string {
  nextId += 1;
  return `b${Date.now().toString(36)}${nextId.toString(36)}`;
}

export function createBlock(kind: string, params: ParamValues = {}): Block {
  const k = blockKind(kind);
  return { id: newBlockId(), kind, enabled: true, params: { ...defaultParams(k.params), ...params } };
}

/** A block's params with anything missing (an older saved design) filled from
 *  the kind's defaults, and any `'auto'` worked out from `context`. */
function resolved(block: Block, context: EvalContext): ParamValues {
  const kind = blockKind(block.kind);
  const params = { ...defaultParams(kind.params), ...block.params };
  for (const spec of kind.params) {
    if (spec.type === 'number' && params[spec.key] === AUTO) {
      params[spec.key] = kind.autoParam?.(spec.key, context) ?? spec.default;
    }
  }
  return params;
}

interface Step {
  apply: (p: Vec3, t: number) => Vec3;
  role: 'source' | 'modifier';
  linear: boolean;
  guide?: Vec3[][];
}

function compile(design: Design, context: EvalContext): Step[] {
  const ctx: EvalContext = { ...context };
  return design.blocks
    .filter((b) => b.enabled)
    .map((b) => {
      const k = blockKind(b.kind);
      const params = resolved(b, ctx);
      if (b.kind === 'torusKnot' || b.kind === 'wrapTorus') ctx.torus = { R: params.R as number, r: params.r as number };
      return {
        apply: (p: Vec3, t: number) => k.apply(p, t, params),
        role: k.role,
        linear: !!k.linear,
        guide: k.guide?.(params),
      };
    });
}

export const timeSpan = (design: Design): number => design.turns * Math.PI * 2;

export interface Curve {
  /** xyz triples, `count` points. A non-finite point is a gap: the line
   *  breaks there, as where a patch cuts the curve off. */
  positions: Float32Array;
  count: number;
  /** Largest distance of any point from the origin. */
  radius: number;
  /** Total arc length of the polyline. */
  length: number;
}

/** Points to sample: the design's own count, or for `'auto'` about 300 per
 *  curve radius of length, measured from a coarse pass. */
export function sampleCount(design: Design, context: EvalContext = {}): number {
  if (design.samples !== AUTO) return Math.max(2, Math.floor(design.samples));
  const probe = evaluate({ ...design, morph: undefined, samples: 3000 }, context);
  return Math.round(Math.min(150_000, Math.max(2000, (probe.length / Math.max(probe.radius, 1e-6)) * 300)));
}

/** The design `morph` blends toward, as a design of its own. */
export function morphTarget(design: Design): Design | null {
  const m = design.morph;
  if (!m) return null;
  return { version: 2, blocks: m.to.blocks, turns: m.to.turns, samples: design.samples, loop: design.loop, passes: design.passes };
}

/** How far a morph has gone, 0–1: 0 when there is none. */
export const morphWeight = (design: Design): number => Math.min(1, Math.max(0, design.morph?.weight ?? 0));

function trace(design: Design, count: number, context: EvalContext): Float32Array {
  const steps = compile(design, context);
  const positions = new Float32Array(count * 3);
  const span = timeSpan(design);
  for (let i = 0; i < count; i++) {
    const t = (i / (count - 1)) * span;
    let p: Vec3 = [0, 0, 0];
    for (const s of steps) p = s.apply(p, t);
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
  }
  return positions;
}

export function evaluate(design: Design, context: EvalContext = {}): Curve {
  const target = morphTarget(design);
  const w = morphWeight(design);
  let positions: Float32Array;
  let count: number;
  if (!target || w === 0) {
    count = sampleCount(design, context);
    positions = trace(design, count, context);
  } else if (w === 1) {
    count = sampleCount(target, context);
    positions = trace(target, count, context);
  } else {
    count = Math.max(sampleCount(design, context), sampleCount(target, context));
    positions = trace(design, count, context);
    const other = trace(target, count, context);
    for (let i = 0; i < positions.length; i++) positions[i] += (other[i] - positions[i]) * w;
  }
  let radius = 0;
  let length = 0;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const r = Math.hypot(x, y, z);
    if (Number.isFinite(r)) radius = Math.max(radius, r);
    if (i > 0) {
      const d = Math.hypot(x - positions[i * 3 - 3], y - positions[i * 3 - 2], z - positions[i * 3 - 1]);
      if (Number.isFinite(d)) length += d;
    }
  }
  return { positions, count, radius, length };
}

export interface Mechanism {
  point: Vec3;
  /** The pen's position after each source since the last non-linear modifier,
   *  starting at that modifier's output (or the origin): the arms. */
  joints: Vec3[];
  /** Wireframes of wrap surfaces, carried through later linear modifiers. */
  guides: Vec3[][];
}

/** The mechanism at time `t` of the curve. Under a morph the pen blends with
 *  the other curve's at the same fraction of its time; the arms are those of
 *  whichever curve dominates. */
export function evaluateAt(design: Design, t: number, context: EvalContext = {}): Mechanism {
  const w = morphWeight(design);
  const target = morphTarget(design);
  const own = mechanismAt(design, t, context);
  const u = t / timeSpan(design);
  if (!target || w === 0) return own;
  const other = mechanismAt(target, u * timeSpan(target), context);
  const point: Vec3 = [0, 1, 2].map((i) => own.point[i] + (other.point[i] - own.point[i]) * w) as Vec3;
  return { ...(w < 0.5 ? own : other), point };
}

function mechanismAt(design: Design, t: number, context: EvalContext): Mechanism {
  let joints: Vec3[] = [[0, 0, 0]];
  let guides: Vec3[][] = [];
  let p: Vec3 = [0, 0, 0];
  for (const s of compile(design, context)) {
    p = s.apply(p, t);
    if (s.role === 'source') {
      joints.push(p);
    } else if (s.linear) {
      joints = joints.map((j) => s.apply(j, t));
      guides = guides.map((line) => line.map((q) => s.apply(q, t)));
    } else {
      joints = [p];
      guides = s.guide ? [...s.guide] : [];
    }
  }
  return { point: p, joints, guides };
}
