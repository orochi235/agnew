import { describe, expect, it } from 'vitest';
import { startsPresenting } from './present';

describe('startsPresenting', () => {
  it('presents for ?bare, the embed URL', () => {
    expect(startsPresenting('?bare')).toBe(true);
    expect(startsPresenting('?bare=1')).toBe(true);
    expect(startsPresenting('?x=2&bare')).toBe(true);
  });

  it('presents for ?present, labkit’s own parameter', () => {
    expect(startsPresenting('?present')).toBe(true);
  });

  it('opens the full lab otherwise', () => {
    expect(startsPresenting('')).toBe(false);
    expect(startsPresenting('?barely')).toBe(false);
  });
});
