import { f, resolveConfigSchema, type ResolvedConfig } from '@weasel-js/labkit';
import type { ParamSpec } from 'agnew';

/** A labkit panel schema for a block kind's plain-data params. */
export function paramSchema(specs: readonly ParamSpec[]): ResolvedConfig {
  const shape: Record<string, ReturnType<typeof f.number> | ReturnType<typeof f.boolean> | ReturnType<typeof f.enum>> = {};
  for (const s of specs) {
    if (s.type === 'number') {
      let node = f.number(s.default).range(s.min, s.max).step(s.step).label(s.label).manual();
      if (s.suffix) node = node.suffix(s.suffix);
      shape[s.key] = node;
    } else if (s.type === 'boolean') {
      shape[s.key] = f.boolean(s.default).label(s.label).manual();
    } else {
      shape[s.key] = f.enum(s.default, s.options).label(s.label).manual();
    }
  }
  return resolveConfigSchema(f.schema(shape));
}

const cache = new Map<string, ResolvedConfig>();
export function cachedParamSchema(kind: string, specs: readonly ParamSpec[]): ResolvedConfig {
  let s = cache.get(kind);
  if (!s) {
    s = paramSchema(specs);
    cache.set(kind, s);
  }
  return s;
}
