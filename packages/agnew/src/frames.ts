/**
 * Parallel-transport frames along a polyline: at each point a tangent and two
 * normals that twist as little as possible. Frenet frames flip at inflections,
 * which tears tubes and ribbons; these do not.
 *
 * Each output array holds xyz triples, one per point.
 */
export interface Frames {
  tangents: Float32Array;
  normals: Float32Array;
  binormals: Float32Array;
}

export function parallelTransport(positions: Float32Array, count: number): Frames {
  const tangents = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const binormals = new Float32Array(count * 3);
  const P = (i: number, c: number) => positions[i * 3 + c];

  let prev = [1, 0, 0];
  for (let i = 0; i < count; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(count - 1, i + 1);
    let t = [P(b, 0) - P(a, 0), P(b, 1) - P(a, 1), P(b, 2) - P(a, 2)];
    let l = Math.hypot(t[0], t[1], t[2]);
    if (l < 1e-12) t = prev;
    else t = [t[0] / l, t[1] / l, t[2] / l];
    prev = t;
    tangents.set(t, i * 3);
  }

  // Seed the first normal with the axis least aligned to the first tangent.
  const t0 = [tangents[0], tangents[1], tangents[2]];
  const ax = Math.abs(t0[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let nrm = orthonormalize(ax, t0);

  for (let i = 0; i < count; i++) {
    const t = [tangents[i * 3], tangents[i * 3 + 1], tangents[i * 3 + 2]];
    nrm = orthonormalize(nrm, t);
    const b = [t[1] * nrm[2] - t[2] * nrm[1], t[2] * nrm[0] - t[0] * nrm[2], t[0] * nrm[1] - t[1] * nrm[0]];
    normals.set(nrm, i * 3);
    binormals.set(b, i * 3);
  }
  return { tangents, normals, binormals };
}

/** `v` with its component along unit `t` removed, then normalized. */
function orthonormalize(v: number[], t: number[]): number[] {
  const d = v[0] * t[0] + v[1] * t[1] + v[2] * t[2];
  let x = v[0] - d * t[0];
  let y = v[1] - d * t[1];
  let z = v[2] - d * t[2];
  let l = Math.hypot(x, y, z);
  if (l < 1e-9) {
    // `v` was parallel to the tangent (a cusp); pick any perpendicular.
    const alt = Math.abs(t[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const e = alt[0] * t[0] + alt[1] * t[1] + alt[2] * t[2];
    x = alt[0] - e * t[0];
    y = alt[1] - e * t[1];
    z = alt[2] - e * t[2];
    l = Math.hypot(x, y, z);
  }
  return [x / l, y / l, z / l];
}
