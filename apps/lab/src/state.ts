import { AUTO, type Design, decode, encode, PRESETS, portableDesign, sanitizeDesign } from 'agnew';
import { autoRotateFrom, COLOR_FILTERS, DEFAULT_VIEW, FIT_MODES, SHAPE_NAMES, STYLES, type ViewSettings } from 'agnew/three';

export interface LabState {
  preset: string;
  design: Design;
  view: ViewSettings;
}

/** What opening the URL's state left out, for the lab to say once; empty when nothing was. */
let openingNotice = '';

export function takeOpeningNotice(): string {
  const n = openingNotice;
  openingNotice = '';
  return n;
}

/** A sentence telling the person what loading `source` left out, or empty. */
export function droppedNotice(source: string, dropped: readonly string[]): string {
  return dropped.length > 0 ? `Left out of ${source}, which this agnew can’t read: ${dropped.join(', ')}.` : '';
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

/** A lab state from untrusted JSON, or `null` when there is no usable design.
 *  What it leaves out is described in `dropped`. */
export function restore(raw: unknown, dropped: string[] = []): LabState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const design = sanitizeDesign(r.design, dropped);
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
  const dropped: string[] = [];
  let state: LabState | null = null;
  try {
    state = restore(decode(m[1]), dropped);
  } catch {
    state = null;
  }
  openingNotice = state
    ? droppedNotice('this link', dropped)
    : `This link’s design couldn’t be read${dropped.length > 0 ? ` (${dropped.join(', ')})` : ''}, so the lab opened on a preset.`;
  return state;
}

/** View settings that may be `'auto'`. */
const AUTO_VIEW_KEYS: readonly (keyof ViewSettings)[] = ['lineWidth', 'lineOpacity', 'bloom', 'azimuth', 'elevation'];

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
    } else if (AUTO_VIEW_KEYS.includes(key) ? got === AUTO || (typeof got === 'number' && Number.isFinite(got)) : typeof got === typeof def) {
      (out as unknown as Record<string, unknown>)[key] = got;
    }
  }
  out.autoRotate = autoRotateFrom(r.autoRotate, DEFAULT_VIEW.autoRotate);
  if (!STYLES.includes(out.style)) out.style = DEFAULT_VIEW.style;
  if (!FIT_MODES.includes(out.fit)) out.fit = DEFAULT_VIEW.fit;
  if (!SHAPE_NAMES.includes(out.shape)) out.shape = DEFAULT_VIEW.shape;
  if (!COLOR_FILTERS.includes(out.filter)) out.filter = DEFAULT_VIEW.filter;
  return out;
}
