import { useTrialId, useTrialState } from '@weasel-js/labkit';
import type { AgnewView } from 'agnew/three';
import { type RefObject, useCallback, useRef } from 'react';
import type { LabState } from './state';

/** A trial's state: the lab state the URL holds. Every change to it is an
 *  edit that undo can step back over. */
export type AgnewState = LabState;

type SetState = (next: AgnewState | ((prev: AgnewState) => AgnewState)) => void;

/** The event that marks an undo step: labkit snapshots the state on it. */
export const EDIT = 'agnew.edit';

/** Edits closer together than this are one undo step, so a slider drag
 *  undoes as a whole. */
const GESTURE_GAP_MS = 500;

const emits = new Map<string, (event: string) => void>();
const lastEdit = new Map<string, number>();

/** Where a trial's edits announce themselves, from its render context. */
export function bindEdits(trialId: string, emit: (event: string) => void) {
  emits.set(trialId, emit);
}

/** The trial's state, with a setter that keeps its identity across renders so
 *  effects and listeners can depend on it. The first change after a pause
 *  opens an undo step. */
export function useAgnew(): { state: AgnewState; setState: SetState } {
  const id = useTrialId();
  const handle = useTrialState<AgnewState>();
  const latest = useRef(handle.setState);
  latest.current = handle.setState;
  const setState = useCallback<SetState>(
    (next) => {
      const now = performance.now();
      if (now - (lastEdit.get(id) ?? -Infinity) > GESTURE_GAP_MS) emits.get(id)?.(EDIT);
      lastEdit.set(id, now);
      latest.current(next);
    },
    [id],
  );
  return { state: handle.state, setState };
}

const views = new Map<string, RefObject<AgnewView | null>>();

/** The trial's view, which its picture creates and its sidebar panels drive. */
export function useAgnewView(): RefObject<AgnewView | null> {
  const id = useTrialId();
  let ref = views.get(id);
  if (!ref) {
    ref = { current: null };
    views.set(id, ref);
  }
  return ref;
}

/** Fit once the layout a state change causes has settled. */
export function refit(view: RefObject<AgnewView | null>) {
  requestAnimationFrame(() => requestAnimationFrame(() => view.current?.fit()));
}
