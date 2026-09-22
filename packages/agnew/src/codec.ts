import { BLOCK_KINDS } from './blocks.js';
import { type Block, type Design, newBlockId } from './design.js';
import { defaultParams, type ParamValue } from './params.js';

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

/**
 * A design from untrusted data (a URL, a file): unknown block kinds and
 * wrongly typed params are dropped, missing params take their defaults, and
 * every block gets a fresh id. Returns `null` when nothing usable is there.
 */
export function sanitizeDesign(value: unknown): Design | null {
  if (!isRecord(value) || !Array.isArray(value.blocks)) return null;
  const blocks: Block[] = [];
  for (const raw of value.blocks) {
    if (!isRecord(raw) || typeof raw.kind !== 'string') continue;
    const kind = kinds.get(raw.kind);
    if (!kind) continue;
    const params = defaultParams(kind.params);
    const given = isRecord(raw.params) ? raw.params : {};
    for (const spec of kind.params) {
      const v = given[spec.key];
      const ok =
        (spec.type === 'number' && typeof v === 'number' && Number.isFinite(v)) ||
        (spec.type === 'boolean' && typeof v === 'boolean') ||
        (spec.type === 'choice' && typeof v === 'string' && spec.options.includes(v));
      if (ok) params[spec.key] = v as ParamValue;
    }
    blocks.push({ id: newBlockId(), kind: kind.kind, enabled: raw.enabled !== false, params });
  }
  const num = (v: unknown, def: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
  return {
    version: 1,
    blocks,
    turns: num(value.turns, 1, 0.01, 1000),
    samples: Math.round(num(value.samples, 8000, 2, 1_000_000)),
  };
}

/** A design without block ids, for sharing: ids are local and regenerated. */
export function portableDesign(design: Design): unknown {
  return { ...design, blocks: design.blocks.map(({ id: _id, ...rest }) => rest) };
}
