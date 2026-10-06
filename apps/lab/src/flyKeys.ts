import type { AgnewView } from 'agnew/three';
import { type RefObject, useEffect } from 'react';

/** Key code → [right, up, forward]. */
const KEYS: Record<string, [number, number, number]> = {
  KeyW: [0, 0, 1],
  KeyS: [0, 0, -1],
  KeyA: [-1, 0, 0],
  KeyD: [1, 0, 0],
  KeyR: [0, 1, 0],
  KeyF: [0, -1, 0],
};

/** Curve radii per second; Shift triples it. */
const SPEED = 0.8;

/** Flies the view's camera while W/A/S/D (forward, left, back, right) and
 *  R/F (up, down) are held. `onFly` runs as a flight starts. */
export function useFlyKeys(view: RefObject<AgnewView | null>, onFly: () => void) {
  useEffect(() => {
    const held = new Set<string>();
    let fast = false;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let [x, y, z] = [0, 0, 0];
      for (const k of held) {
        x += KEYS[k][0];
        y += KEYS[k][1];
        z += KEYS[k][2];
      }
      const d = SPEED * (fast ? 3 : 1) * dt;
      view.current?.fly(x * d, y * d, z * d);
      raf = held.size ? requestAnimationFrame(tick) : 0;
    };
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]');
    const down = (e: KeyboardEvent) => {
      fast = e.shiftKey;
      if (!(e.code in KEYS) || e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      e.preventDefault();
      if (!held.size) onFly();
      held.add(e.code);
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    const up = (e: KeyboardEvent) => {
      fast = e.shiftKey;
      held.delete(e.code);
    };
    const clear = () => held.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, [view, onFly]);
}
