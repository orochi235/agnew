import { BLOCK_KINDS, type BlockKind } from './blocks.js';
import { type Block, type Design, newBlockId } from './design.js';
import { DEFAULT_LOOP, type Motion, sanitizeMotion } from './motion.js';
import { AUTO, defaultParams, type ParamValue } from './params.js';

const kinds = new Map(BLOCK_KINDS.map((k) => [k.kind, k]));

/** Any JSON value as a URL-safe base64 string. */
export function encode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decode(text: string): unknown {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isNumberParam = (kind: BlockKind, key: string) => kind.params.some((p) => p.key === key && p.type === 'number');

function sanitizeBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  const blocks: Block[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.kind !== 'string') continue;
    const kind = kinds.get(item.kind);
    if (!kind) continue;
    const params = defaultParams(kind.params);
    const given = isRecord(item.params) ? item.params : {};
    for (const spec of kind.params) {
      const v = given[spec.key];
      const ok =
        (spec.type === 'number' && typeof v === 'number' && Number.isFinite(v)) ||
        (spec.type === 'number' && spec.auto === true && v === AUTO) ||
        (spec.type === 'boolean' && typeof v === 'boolean') ||
        (spec.type === 'choice' && typeof v === 'string' && spec.options.includes(v));
      if (ok) params[spec.key] = v as ParamValue;
    }
    const block: Block = { id: newBlockId(), kind: kind.kind, enabled: item.enabled !== false, params };
    if (isRecord(item.motion)) {
      const motion: Record<string, Motion> = {};
      for (const [key, m] of Object.entries(item.motion)) {
        const clean = isNumberParam(kind, key) ? sanitizeMotion(m) : null;
        if (clean) motion[key] = clean;
      }
      if (Object.keys(motion).length > 0) block.motion = motion;
    }
    blocks.push(block);
  }
  return blocks;
}

const num = (v: unknown, def: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;

/**
 * A design from untrusted data (a URL, a file): unknown block kinds and
 * wrongly typed params or motions are dropped, missing params take their
 * defaults, and every block gets a fresh id. A version 1 design loads as
 * one with no motion. Returns `null` when nothing usable is there.
 */
export function sanitizeDesign(value: unknown): Design | null {
  if (!isRecord(value) || !Array.isArray(value.blocks)) return null;
  const design: Design = {
    version: 2,
    blocks: sanitizeBlocks(value.blocks),
    turns: num(value.turns, 1, 0.01, 1000),
    samples: value.samples === AUTO ? AUTO : Math.round(num(value.samples, 8000, 2, 1_000_000)),
    loop: num(value.loop, DEFAULT_LOOP, 0.5, 600),
    passes: Math.round(num(value.passes, 1, 1, 100)),
  };
  const m = value.morph;
  if (isRecord(m) && isRecord(m.to)) {
    const motion = sanitizeMotion(m.motion);
    design.morph = {
      to: { blocks: sanitizeBlocks(m.to.blocks), turns: num(m.to.turns, 1, 0.01, 1000) },
      weight: num(m.weight, 0, 0, 1),
      ...(motion ? { motion } : {}),
    };
  }
  return design;
}

const withoutIds = (blocks: Block[]) => blocks.map(({ id: _id, ...rest }) => rest);

/** A design without block ids, for sharing: ids are local and regenerated. */
export function portableDesign(design: Design): unknown {
  const out: Record<string, unknown> = { ...design, blocks: withoutIds(design.blocks) };
  if (design.morph) out.morph = { ...design.morph, to: { ...design.morph.to, blocks: withoutIds(design.morph.to.blocks) } };
  return out;
}
