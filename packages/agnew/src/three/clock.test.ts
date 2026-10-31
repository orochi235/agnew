import { describe, expect, it } from 'vitest';
import { loopTime } from './clock.js';

describe('loopTime', () => {
  it('reads elapsed ms as seconds into the loop', () => {
    expect(loopTime(2500, 4)).toBeCloseTo(2.5);
  });

  it('wraps a later pass back into the loop', () => {
    expect(loopTime(9000, 4)).toBeCloseTo(1);
  });

  it('wraps a clock run backward past its start to the loop end', () => {
    expect(loopTime(-1000, 4)).toBeCloseTo(3);
  });
});
