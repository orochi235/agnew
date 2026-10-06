import { describe, expect, it } from 'vitest';
import { autoRotateFrom, type DragSample, flingFrom } from './rotation.js';

/** A camera swung around the vertical, `deg` degrees from +z. */
const around = (t: number, deg: number): DragSample => {
  const a = (deg * Math.PI) / 180;
  return { t, dir: [Math.sin(a), 0, Math.cos(a)] };
};

describe('flingFrom', () => {
  it('turns the curve against the camera, at the drag’s rate', () => {
    const f = flingFrom([around(0, 0), around(50, 5), around(100, 10)], 110);
    expect(f).not.toBeNull();
    // The camera went +y about the vertical, so the curve turns about -y.
    expect(f!.axis[1]).toBeCloseTo(-1);
    expect(f!.rate).toBeCloseTo(((10 * Math.PI) / 180) / 0.1, 3);
  });

  it('throws nothing from a drag that came to rest before release', () => {
    expect(flingFrom([around(0, 0), around(100, 10)], 400)).toBeNull();
  });

  it('throws nothing from a drag that never turned', () => {
    expect(flingFrom([around(0, 5), around(50, 5)], 60)).toBeNull();
  });

  it('caps a hard throw', () => {
    expect(flingFrom([around(0, 0), around(10, 90)], 10)!.rate).toBe(4);
  });
});

describe('autoRotateFrom', () => {
  it('reads the old boolean as orbit or off', () => {
    expect(autoRotateFrom(true, 'off')).toBe('orbit');
    expect(autoRotateFrom(false, 'orbit')).toBe('off');
    expect(autoRotateFrom('fling', 'off')).toBe('fling');
    expect(autoRotateFrom('sideways', 'orbit')).toBe('orbit');
  });
});
