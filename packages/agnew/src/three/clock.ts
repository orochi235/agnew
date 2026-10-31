/**
 * A clock a view plays on in place of its own: a labkit trial clock fits as
 * it is. It must be seekable, since scrubbing and restarting the trace seek it.
 */
export interface ViewClock {
  /** ms played, counted across passes. */
  readonly elapsed: number;
  /** Signed speed; 0 is paused. */
  readonly rate: number;
  seek(elapsed: number): void;
}

/** Seconds into a loop of `loop` seconds, `elapsed` ms in; a clock run
 *  backward past its start lands at the loop's end, not below 0. */
export function loopTime(elapsed: number, loop: number): number {
  const t = (elapsed / 1000) % loop;
  return t < 0 ? t + loop : t;
}
