import { type Design, decode, encode, PRESETS, portableDesign, sanitizeDesign } from 'agnew';
import { DEFAULT_VIEW, STYLES, type ViewSettings } from 'agnew/three';

export interface LabState {
  preset: string;
  design: Design;
  view: ViewSettings;
}

export function initialState(): LabState {
  const fromHash = readHash();
  if (fromHash) return fromHash;
  const p = PRESETS[0];
  return { preset: p.name, design: p.design(), view: DEFAULT_VIEW };
}

/** The lab state as plain JSON: what the URL, saved presets and files hold. */
export function snapshot(s: LabState): unknown {
  return { preset: s.preset, design: portableDesign(s.design), view: s.view };
}

/** A lab state from untrusted JSON, or `null` when there is no usable design. */
export function restore(raw: unknown): LabState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const design = sanitizeDesign(r.design);
  if (!design) return null;
  return { preset: typeof r.preset === 'string' ? r.preset : '', design, view: sanitizeView(r.view) };
}

/** The whole lab as a URL hash, so any state is a link. */
export function writeHash(s: LabState): void {
  history.replaceState(null, '', `#s=${encode(snapshot(s))}`);
}

function readHash(): LabState | null {
  const m = location.hash.match(/^#s=([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try {
    return restore(decode(m[1]));
  } catch {
    return null;
  }
}

function sanitizeView(v: unknown): ViewSettings {
  const out: ViewSettings = { ...DEFAULT_VIEW, layers: { ...DEFAULT_VIEW.layers } };
  if (typeof v !== 'object' || v === null) return out;
  const r = v as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_VIEW) as (keyof ViewSettings)[]) {
    const def = DEFAULT_VIEW[key];
    const got = r[key];
    if (key === 'layers') {
      if (typeof got === 'object' && got !== null) {
        for (const l of ['curve', 'trace', 'mechanism'] as const) {
          const b = (got as Record<string, unknown>)[l];
          if (typeof b === 'boolean') out.layers[l] = b;
        }
      }
    } else if (typeof got === typeof def) {
      (out as unknown as Record<string, unknown>)[key] = got;
    }
  }
  if (!STYLES.includes(out.style)) out.style = DEFAULT_VIEW.style;
  return out;
}
