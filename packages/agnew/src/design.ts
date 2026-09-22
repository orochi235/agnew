import { blockKind } from './blocks.js';
import { defaultParams, type ParamValues } from './params.js';
import type { Vec3 } from './vec.js';

export interface Block {
  id: string;
  kind: string;
  enabled: boolean;
  params: ParamValues;
}

/** Everything that determines the curve. Plain data: safe to serialize. */
export interface Design {
  version: 1;
  blocks: Block[];
  /** How many base cycles (2π of time) the curve runs for. */
  turns: number;
  /** Points sampled along the whole curve. */
  samples: number;
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
 *  the kind's defaults. */
function resolved(block: Block): ParamValues {
  return { ...defaultParams(blockKind(block.kind).params), ...block.params };
}

interface Step {
  apply: (p: Vec3, t: number) => Vec3;
  role: 'source' | 'modifier';
  linear: boolean;
  guide?: Vec3[][];
}

function compile(design: Design): Step[] {
  return design.blocks
    .filter((b) => b.enabled)
    .map((b) => {
      const k = blockKind(b.kind);
      const params = resolved(b);
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
  /** xyz triples, `count` points. */
  positions: Float32Array;
  count: number;
  /** Largest distance of any point from the origin. */
  radius: number;
  /** Total arc length of the polyline. */
  length: number;
}

export function evaluate(design: Design): Curve {
  const steps = compile(design);
  const count = Math.max(2, Math.floor(design.samples));
  const positions = new Float32Array(count * 3);
  const span = timeSpan(design);
  let radius = 0;
  let length = 0;
  for (let i = 0; i < count; i++) {
    const t = (i / (count - 1)) * span;
    let p: Vec3 = [0, 0, 0];
    for (const s of steps) p = s.apply(p, t);
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
    radius = Math.max(radius, Math.hypot(p[0], p[1], p[2]));
    if (i > 0) {
      length += Math.hypot(p[0] - positions[i * 3 - 3], p[1] - positions[i * 3 - 2], p[2] - positions[i * 3 - 1]);
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

export function evaluateAt(design: Design, t: number): Mechanism {
  let joints: Vec3[] = [[0, 0, 0]];
  let guides: Vec3[][] = [];
  let p: Vec3 = [0, 0, 0];
  for (const s of compile(design)) {
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
