/** Cumulative arc length at each point of a polyline of `count` xyz points. */
export function arcLengths(positions: Float32Array, count: number): Float64Array {
  const cum = new Float64Array(count);
  for (let i = 1; i < count; i++) {
    const a = (i - 1) * 3;
    const b = i * 3;
    cum[i] =
      cum[i - 1] + Math.hypot(positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]);
  }
  return cum;
}

/** The fractional point index at arc length `s`, clamped to the polyline. */
export function indexAtLength(cum: Float64Array, s: number): number {
  const n = cum.length;
  if (n < 2 || s <= 0) return 0;
  if (s >= cum[n - 1]) return n - 1;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo];
  return lo + (span > 0 ? (s - cum[lo]) / span : 0);
}
