import { useCallback, useState } from 'react';
import { type LabState, restore, snapshot } from './state';

/** Built-in presets are addressed by name; saved ones by this prefix plus theirs. */
export const SAVED_PREFIX = 'saved:';

const KEY = 'agnew.presets';

export interface SavedPreset {
  name: string;
  state: LabState;
}

function read(): SavedPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    const out: SavedPreset[] = [];
    for (const item of raw) {
      const state = restore(item?.state);
      if (typeof item?.name === 'string' && state) out.push({ name: item.name, state });
    }
    return out;
  } catch {
    return [];
  }
}

function write(list: SavedPreset[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.map((p) => ({ name: p.name, state: snapshot(p.state) }))));
    return true;
  } catch {
    return false;
  }
}

/** Presets saved in this browser. Saving under an existing name replaces it. */
export function useSavedPresets() {
  const [list, setList] = useState(read);
  const save = useCallback((name: string, state: LabState) => {
    const next = [...read().filter((p) => p.name !== name), { name, state: { ...state, preset: SAVED_PREFIX + name } }];
    next.sort((a, b) => a.name.localeCompare(b.name));
    const ok = write(next);
    setList(next);
    return ok;
  }, []);
  const remove = useCallback((name: string) => {
    const next = read().filter((p) => p.name !== name);
    write(next);
    setList(next);
  }, []);
  return { list, save, remove };
}

/** A preset as a downloadable JSON file. */
export function presetFile(name: string, state: LabState): Blob {
  return new Blob([JSON.stringify({ agnew: 1, name, ...(snapshot(state) as object) }, null, 2)], {
    type: 'application/json',
  });
}

/** A preset from a file's text; throws with a readable message when it is not one. */
export function parsePresetFile(text: string): { name: string; state: LabState } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not JSON.');
  }
  const state = restore(raw);
  if (!state) throw new Error('That file has no agnew design in it.');
  const name = typeof (raw as { name?: unknown }).name === 'string' ? (raw as { name: string }).name : 'Imported';
  return { name, state };
}
