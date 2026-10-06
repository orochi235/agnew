import { BufferAttribute, BufferGeometry } from 'three';
import { parallelTransport } from '../frames.js';

/**
 * Mesh geometry swept along a polyline. Rings are laid out in curve order, so
 * `setDrawRange(0, indicesUpTo(k))` draws the first `k` segments — which is
 * how the trace layer reveals a mesh.
 */
export interface SweptGeometry {
  geometry: BufferGeometry;
  /** Index count covering the first `segments` segments of the curve. */
  indicesUpTo(segments: number): number;
  segments: number;
}

function finish(
  pos: Float32Array,
  nor: Float32Array,
  col: Float32Array,
  idx: Uint32Array,
  perSegment: number,
  segments: number,
): SweptGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new BufferAttribute(nor, 3));
  geometry.setAttribute('color', new BufferAttribute(col, 3));
  geometry.setIndex(new BufferAttribute(idx, 1));
  geometry.computeBoundingSphere();
  return {
    geometry,
    segments,
    indicesUpTo: (k) => Math.max(0, Math.min(segments, Math.floor(k))) * perSegment,
  };
}

/** A round tube of `radius` with `radial` sides around each point. */
export function buildTube(
  positions: Float32Array,
  count: number,
  colors: Float32Array,
  radius: number,
  radial: number,
): SweptGeometry {
  const f = parallelTransport(positions, count);
  const ring = radial + 1;
  const pos = new Float32Array(count * ring * 3);
  const nor = new Float32Array(count * ring * 3);
  const col = new Float32Array(count * ring * 3);
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < ring; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const o = (i * ring + j) * 3;
      for (let k = 0; k < 3; k++) {
        const n = f.normals[i * 3 + k] * c + f.binormals[i * 3 + k] * s;
        nor[o + k] = n;
        pos[o + k] = positions[i * 3 + k] + n * radius;
        col[o + k] = colors[i * 3 + k];
      }
    }
  }
  const segments = count - 1;
  const idx = new Uint32Array(segments * radial * 6);
  let w = 0;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ring + j;
      const b = a + ring;
      idx.set([a, b, a + 1, b, b + 1, a + 1], w);
      w += 6;
    }
  }
  return finish(pos, nor, col, idx, radial * 6, segments);
}

/** A flat band `width` wide whose face turns `twist` full times along the curve. */
export function buildRibbon(
  positions: Float32Array,
  count: number,
  colors: Float32Array,
  width: number,
  twist: number,
): SweptGeometry {
  const f = parallelTransport(positions, count);
  const pos = new Float32Array(count * 2 * 3);
  const nor = new Float32Array(count * 2 * 3);
  const col = new Float32Array(count * 2 * 3);
  for (let i = 0; i < count; i++) {
    const a = (twist * i * Math.PI * 2) / Math.max(1, count - 1);
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (let k = 0; k < 3; k++) {
      const n = f.normals[i * 3 + k];
      const b = f.binormals[i * 3 + k];
      const side = (n * c + b * s) * width * 0.5;
      const face = -n * s + b * c;
      const p = positions[i * 3 + k];
      pos[i * 6 + k] = p + side;
      pos[i * 6 + 3 + k] = p - side;
      nor[i * 6 + k] = face;
      nor[i * 6 + 3 + k] = face;
      col[i * 6 + k] = colors[i * 3 + k];
      col[i * 6 + 3 + k] = colors[i * 3 + k];
    }
  }
  const segments = count - 1;
  const idx = new Uint32Array(segments * 6);
  for (let i = 0; i < segments; i++) {
    const k = i * 2;
    idx.set([k, k + 1, k + 2, k + 1, k + 3, k + 2], i * 6);
  }
  return finish(pos, nor, col, idx, 6, segments);
}

/** Reduce a curve to at most `max` points by striding, keeping the last one. */
export function decimate(positions: Float32Array, count: number, max: number): { positions: Float32Array; count: number } {
  if (count <= max) return { positions, count };
  const out = new Float32Array(max * 3);
  for (let i = 0; i < max; i++) {
    const src = Math.round((i / (max - 1)) * (count - 1));
    out.set(positions.subarray(src * 3, src * 3 + 3), i * 3);
  }
  return { positions: out, count: max };
}

/**
 * A polyline as separate segments, leaving out any that touch a non-finite
 * point, so the line breaks at gaps. `order` holds each kept segment's index
 * in the polyline, ascending, for revealing a prefix of it.
 */
export function gapSegments(
  positions: Float32Array,
  colors: Float32Array,
  count: number,
): { positions: Float32Array; colors: Float32Array; order: Uint32Array } {
  const keep: number[] = [];
  const ok = (i: number) =>
    Number.isFinite(positions[i * 3]) && Number.isFinite(positions[i * 3 + 1]) && Number.isFinite(positions[i * 3 + 2]);
  for (let i = 0; i + 1 < count; i++) if (ok(i) && ok(i + 1)) keep.push(i);
  const pos = new Float32Array(keep.length * 6);
  const col = new Float32Array(keep.length * 6);
  keep.forEach((i, k) => {
    pos.set(positions.subarray(i * 3, i * 3 + 6), k * 6);
    col.set(colors.subarray(i * 3, i * 3 + 6), k * 6);
  });
  return { positions: pos, colors: col, order: Uint32Array.from(keep) };
}

/** The finite points of a polyline, in order; meshes bridge the gaps. */
export function dropGaps(positions: Float32Array, count: number): { positions: Float32Array; count: number } {
  const out = new Float32Array(count * 3);
  let n = 0;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    out[n * 3] = x;
    out[n * 3 + 1] = y;
    out[n * 3 + 2] = z;
    n++;
  }
  return { positions: n === count ? positions : out.subarray(0, n * 3), count: n };
}
