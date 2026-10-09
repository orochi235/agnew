import { useTrialId, useTrialState } from '@weasel-js/labkit';
import type { AgnewView } from 'agnew/three';
import { type RefObject, useCallback, useRef } from 'react';
import type { LabState } from './state';

/** A trial's state: the lab state the URL holds, and whether the view plays. */
export interface AgnewState extends LabState {
  playing: boolean;
}

type SetState = (next: AgnewState | ((prev: AgnewState) => AgnewState)) => void;

/** The trial's state, with a setter that keeps its identity across renders so
 *  effects and listeners can depend on it. */
export function useAgnew(): { state: AgnewState; setState: SetState } {
  const handle = useTrialState<AgnewState>();
  const latest = useRef(handle.setState);
  latest.current = handle.setState;
  const setState = useCallback<SetState>((next) => latest.current(next), []);
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
