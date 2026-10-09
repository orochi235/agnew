import { type Channel, keys, type Mix, mix, type Patch, patch, sum } from '@msb235/blits';
import type { Block, Design } from './design.js';
import type { Motion, WaveMotion, WaveShape } from './motion.js';

/** A design over time. */
export interface Animator {
  /** Whether anything moves. */
  readonly moving: boolean;
  /** The design as it stands `seconds` into its timeline: every value fixed,
   *  no motions left. Any time is allowed; the loop repeats. */
  at(seconds: number): Design;
}

const SUBJECT = 'design';
const MORPH = 'morph';

type Pose = Record<string, number>;

interface Mover {
  channel: string;
  motion: Motion;
}

const channelFor = (block: number, key: string) => `${block}.${key}`;

/** One blits mix over the design's moving values: a channel per value, a
 *  looping voice per motion. A wave's channel is added to the set value; a
 *  `keys` channel replaces it. */
export function animate(design: Design): Animator {
  const movers: Mover[] = [];
  design.blocks.forEach((b, i) => {
    for (const [key, motion] of Object.entries(b.motion ?? {})) {
      if (typeof b.params[key] === 'number') movers.push({ channel: channelFor(i, key), motion });
    }
  });
  if (design.morph?.motion) movers.push({ channel: MORPH, motion: design.morph.motion });
  if (movers.length === 0) {
    const still = fixed(design, () => undefined);
    return { moving: false, at: () => still };
  }

  const loopMs = design.loop * 1000;
  const kit: Record<string, Channel<number>> = {};
  for (const m of movers) kit[m.channel] = sum();
  const timeline: Mix<string, Pose> = mix<string, Pose>(kit);
  for (const m of movers) timeline.cue({ patch: patchFor(m, loopMs, kit), loop: true, start: 0 });

  // The mix's clock only runs forward: an earlier point in the loop is reached
  // by wrapping forward to the same point in a later pass.
  let pass = 0;
  let last = -1;
  const pose: Pose = {};
  return {
    moving: true,
    at(seconds) {
      const into = (((seconds * 1000) % loopMs) + loopMs) % loopMs;
      let ms = pass * loopMs + into;
      if (ms < last) {
        pass += 1;
        ms += loopMs;
      }
      last = ms;
      timeline.sync(ms);
      timeline.probe(SUBJECT, pose);
      const read = (channel: string): number | undefined => {
        const v = pose[channel];
        return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
      };
      return fixed(design, read);
    },
  };
}

function patchFor(m: Mover, loopMs: number, kit: Record<string, Channel<number>>): Patch<string, Pose, unknown> {
  const own = { [m.channel]: kit[m.channel] };
  if (m.motion.kind === 'keys') {
    return keys<string, Pose>(
      loopMs,
      m.motion.stops.map((s) => ({ at: s.at, delta: { [m.channel]: s.value } })),
      { ease: m.motion.ease, kit: own },
    );
  }
  return wavePatch(m.channel, m.motion, loopMs, own);
}

// blits gains a `wave` patch in its next release (branch `wave`); this stands
// in for it until agnew can take that from npm.
function wavePatch(channel: string, w: WaveMotion, loopMs: number, kit: Record<string, Channel<number>>) {
  return patch<string, Pose>(
    loopMs,
    (phase) => ({ [channel]: w.depth * waveAt(w.shape, phase * w.cycles + w.phase) }),
    { kit },
  );
}

/** The unit wave, -1..1 at `x` cycles: starts at 0 and rises (square: +1 for
 *  the first half). */
export function waveAt(shape: WaveShape, x: number): number {
  const f = x - Math.floor(x);
  if (shape === 'sine') return Math.sin(f * Math.PI * 2);
  if (shape === 'triangle') return f < 0.25 ? 4 * f : f < 0.75 ? 2 - 4 * f : 4 * f - 4;
  if (shape === 'saw') return f < 0.5 ? 2 * f : 2 * f - 2;
  return f < 0.5 ? 1 : -1;
}

/** The design with every moving value read from `read`, and no motions. */
function fixed(design: Design, read: (channel: string) => number | undefined): Design {
  const blocks = design.blocks.map((b, i) => settle(b, i, read));
  const out: Design = { ...design, blocks };
  if (design.morph) {
    const { motion: _m, ...morph } = design.morph;
    const moved = design.morph.motion ? read(MORPH) : undefined;
    const base = design.morph.motion?.kind === 'wave' ? morph.weight + (moved ?? 0) : (moved ?? morph.weight);
    out.morph = { ...morph, weight: Math.min(1, Math.max(0, base)) };
  }
  return out;
}

function settle(block: Block, index: number, read: (channel: string) => number | undefined): Block {
  const { motion, ...rest } = block;
  if (!motion) return rest;
  const params = { ...block.params };
  for (const [key, m] of Object.entries(motion)) {
    const set = params[key];
    if (typeof set !== 'number') continue;
    const v = read(channelFor(index, key));
    if (v === undefined) continue;
    params[key] = m.kind === 'wave' ? set + v : v;
  }
  return { ...rest, params };
}
