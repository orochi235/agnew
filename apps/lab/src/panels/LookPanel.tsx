import { ControlPanel, isAuto, withValueAtPath } from '@weasel-js/labkit';
import { AUTO } from 'agnew';
import { cameraPresetsFor, frameAspect, type Shape, SHAPES, STYLE_DEFAULTS, type Style, type ViewSettings } from 'agnew/three';
import { refit, useAgnew, useAgnewView } from '../session';
import { viewSchema } from '../viewSchema';

/** The keys of `config` set to `'auto'`, for a panel to show as auto. */
function autoKeys(config: Record<string, unknown>): ReadonlySet<string> {
  return new Set(Object.keys(config).filter((k) => config[k] === AUTO));
}

/**
 * `config` with each `'auto'` replaced by a number, for a panel: labkit keeps
 * a field's value apart from its auto flag and pins it back at that value,
 * so it needs a number there. `fill` gives the number in use, where known.
 */
function withNumbers<T extends Record<string, unknown>>(config: T, fill: (key: string) => number | undefined): T {
  const out: Record<string, unknown> = { ...config };
  for (const k of Object.keys(out)) if (out[k] === AUTO) out[k] = fill(k);
  return out as T;
}

const round = (v: number) => Math.round(v * 100) / 100;

/** What an auto view setting pins to when the view has no number for it yet. */
const DEFAULT_PINNED = { lineWidth: 1.6, lineOpacity: 0.55, bloom: 0.9, azimuth: 19, elevation: 15 };

/** How the curve is drawn and framed. */
export function LookPanel() {
  const { state, setState } = useAgnew();
  const viewRef = useAgnewView();

  const setView = (path: string, raw: unknown) =>
    setState((s) => {
      const value = isAuto(raw) ? AUTO : raw;
      let view = withValueAtPath(s.view, path, value) as ViewSettings;
      if (path === 'style') view = { ...view, ...STYLE_DEFAULTS[value as Style] };
      const named = path === 'shape' ? SHAPES[value as Shape].ratio : null;
      if (named) view = { ...view, ratioW: named[0], ratioH: named[1] };
      if ((path === 'ratioW' || path === 'ratioH') && SHAPES[view.shape].ratio) view = { ...view, shape: 'custom' };
      if ((path === 'shape' && value !== 'free') || path === 'ratioW' || path === 'ratioH') {
        view = { ...view, fit: 'tight', autoRotate: 'off', azimuth: AUTO, elevation: AUTO };
      }
      return { ...s, view };
    });

  const aimAt = (azimuth: number, elevation: number) => {
    setState((s) => ({ ...s, view: { ...s.view, azimuth, elevation, autoRotate: 'off' } }));
    refit(viewRef);
  };

  return (
    <div className="ag-panel">
      <ControlPanel
        schema={viewSchema}
        config={
          withNumbers(state.view as never, (k) => {
            const v = viewRef.current?.resolved()[k as 'bloom'];
            return v === undefined ? (DEFAULT_PINNED as Record<string, number>)[k] : round(v);
          }) as never
        }
        setConfig={setView}
        auto={autoKeys(state.view as never)}
        density="tight"
      />
      <div className="ag-buttons">
        <button
          className="ag-btn"
          type="button"
          onClick={() =>
            setState((s) => ({ ...s, view: { ...s.view, fit: 'tight', autoRotate: 'off', azimuth: AUTO, elevation: AUTO } }))
          }
        >
          Fill frame
        </button>
        {cameraPresetsFor(frameAspect(state.view)).map((c) => (
          <button className="ag-btn" key={c.label} type="button" onClick={() => aimAt(c.azimuth, c.elevation)}>
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
