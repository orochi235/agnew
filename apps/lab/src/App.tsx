import { type ConfigOption, ControlPanel, f, LabShell, resolveConfigSchema, withValueAtPath } from '@weasel-js/labkit';
import { type Design, PRESETS, presetByName } from 'agnew';
import { type AgnewView, createAgnewView, PALETTES, STYLE_DEFAULTS, STYLES, type Style, type ViewSettings } from 'agnew/three';
import { useEffect, useMemo, useRef, useState } from 'react';
import { parsePresetFile, presetFile, SAVED_PREFIX, useSavedPresets } from './saved';
import { StackEditor } from './StackEditor';
import { initialState, type LabState, writeHash } from './state';

/** The dropdown's value while the state matches no preset. */
const CUSTOM = 'custom';

const curveSchema = resolveConfigSchema(
  f.schema({
    turns: f.number(1).range(0.25, 60).step(0.25).label('Turns').manual(),
    samples: f.number(8000).range(500, 120000).step(500).label('Samples').manual(),
  }),
);

const isStyle = (...styles: Style[]) => (c: Record<string, unknown>) => styles.includes(c.style as Style);

const viewSchema = resolveConfigSchema(
  f.schema({
    style: f.enum('neon', [...STYLES]).label('Style').manual(),
    palette: f.enum('aurora', Object.keys(PALETTES)).label('Palette').manual(),
    background: f.color('#05060a').label('Background').manual(),
    bloom: f.number(0.9).range(0, 3).step(0.05).label('Bloom').manual(),
    lineWidth: f.number(1.6).range(0.5, 6).step(0.1).label('Line width').suffix('px').manual().showIf(isStyle('neon', 'ink')),
    lineOpacity: f.number(0.55).range(0.02, 1).step(0.01).label('Line opacity').manual().showIf(isStyle('neon', 'ink')),
    tubeRadius: f.number(0.012).range(0.002, 0.06).step(0.001).label('Tube radius').manual().showIf(isStyle('tube')),
    ribbonWidth: f.number(0.035).range(0.005, 0.15).step(0.001).label('Ribbon width').manual().showIf(isStyle('ribbon')),
    ribbonTwist: f.number(40).range(0, 400).step(1).label('Ribbon twists').manual().showIf(isStyle('ribbon')),
    autoRotate: f.boolean(true).label('Auto-rotate').manual(),
    layers: f.group({
      curve: f.boolean(true).label('Curve').manual(),
      trace: f.boolean(false).label('Trace').manual(),
      mechanism: f.boolean(false).label('Mechanism').manual(),
    }),
    traceSpeed: f
      .number(4)
      .range(0.25, 30)
      .step(0.25)
      .label('Trace speed')
      .describe("How far the pen travels per second, in multiples of the curve's radius.")
      .manual(),
  }),
);

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const presetLabel = (preset: string) => (preset.startsWith(SAVED_PREFIX) ? preset.slice(SAVED_PREFIX.length) : preset);

function fileStem(name: string) {
  return `agnew-${(name || 'custom').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

export function App() {
  const [state, setState] = useState<LabState>(initialState);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(10);
  const saved = useSavedPresets();
  const [name, setName] = useState(() => (state.preset.startsWith(SAVED_PREFIX) ? presetLabel(state.preset) : ''));
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<AgnewView | null>(null);

  useEffect(() => {
    const view = createAgnewView(canvasRef.current!, { design: state.design, settings: state.view });
    viewRef.current = view;
    requestAnimationFrame(() => view.fit());
    // The view is created once; later changes flow through the effects below.
    return () => view.dispose();
  }, []);

  useEffect(() => viewRef.current?.setDesign(state.design), [state.design]);
  useEffect(() => viewRef.current?.setSettings(state.view), [state.view]);
  useEffect(() => {
    const id = setTimeout(() => writeHash(state), 250);
    return () => clearTimeout(id);
  }, [state]);

  const setDesign = (design: Design) => setState((s) => ({ ...s, design, preset: '' }));
  const refit = () => requestAnimationFrame(() => requestAnimationFrame(() => viewRef.current?.fit()));
  const loadPreset = (value: string) => {
    setNote('');
    if (value.startsWith(SAVED_PREFIX)) {
      const p = saved.list.find((x) => SAVED_PREFIX + x.name === value);
      if (!p) return;
      setState({ ...p.state, preset: value });
      setName(p.name);
    } else {
      const p = presetByName(value);
      if (!p) return;
      setState((s) => ({ ...s, preset: value, design: p.design() }));
      setName('');
    }
    refit();
  };
  const savePreset = () => {
    const n = name.trim() || 'Untitled';
    setName(n);
    const ok = saved.save(n, state);
    setState((s) => ({ ...s, preset: SAVED_PREFIX + n }));
    setNote(ok ? `Saved “${n}” in this browser.` : 'This browser would not store it; use Save file instead.');
  };
  const deletePreset = () => {
    const n = presetLabel(state.preset);
    saved.remove(n);
    setState((s) => ({ ...s, preset: '' }));
    setNote(`Deleted “${n}”.`);
  };
  const saveFile = () => {
    const n = name.trim() || presetLabel(state.preset) || 'Untitled';
    download(presetFile(n, state), `${fileStem(n)}.agnew.json`);
  };
  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const p = parsePresetFile(await file.text());
      setState({ ...p.state, preset: '' });
      setName(p.name);
      setNote(`Loaded “${p.name}” from ${file.name}.`);
      refit();
    } catch (e) {
      setNote((e as Error).message);
    }
  };
  const setView = (path: string, value: unknown) =>
    setState((s) => {
      let view = withValueAtPath(s.view, path, value) as ViewSettings;
      if (path === 'style') view = { ...view, ...STYLE_DEFAULTS[value as Style] };
      return { ...s, view };
    });

  const exportPNG = async (scale: number) => {
    const blob = await viewRef.current?.exportPNG(scale);
    if (blob) download(blob, `${fileStem(presetLabel(state.preset))}@${scale}x.png`);
  };
  const record = async () => {
    const view = viewRef.current;
    if (!view || recording) return;
    setRecording(true);
    try {
      download(await view.record(recordSeconds, { restartTrace: true }), `${fileStem(presetLabel(state.preset))}.webm`);
    } finally {
      setRecording(false);
    }
  };

  const presetOptions = useMemo(() => {
    const options: ConfigOption[] = [
      ...PRESETS.map((p) => ({ value: p.name, label: p.name })),
      ...saved.list.map((p) => ({ value: SAVED_PREFIX + p.name, label: `${p.name} (saved)` })),
    ];
    return options.some((o) => o.value === state.preset)
      ? options
      : [{ value: CUSTOM, label: 'Custom (unsaved)' }, ...options];
  }, [saved.list, state.preset]);
  const presetSchema = useMemo(
    () => resolveConfigSchema(f.schema({ preset: f.enum<string>(CUSTOM, presetOptions).label('Preset').manual() })),
    [presetOptions],
  );
  const presetValue = presetOptions.some((o) => o.value === state.preset) ? state.preset : CUSTOM;

  return (
    <LabShell title="agnew" mode="dark">
      <div className="ag-layout">
        <div className="ag-viewport">
          <canvas ref={canvasRef} className="ag-canvas" />
          {!state.preset && <div className="ag-badge">custom</div>}
        </div>
        <aside className="ag-sidebar">
          <section className="ag-section">
            <ControlPanel
              schema={presetSchema}
              config={{ preset: presetValue }}
              setConfig={(_p, v) => v !== CUSTOM && loadPreset(v as string)}
            />
            <form
              className="ag-buttons"
              onSubmit={(e) => {
                e.preventDefault();
                savePreset();
              }}
            >
              <input
                className="ag-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Preset name"
                aria-label="Preset name"
              />
              <button type="submit">Save preset</button>
              {state.preset.startsWith(SAVED_PREFIX) && (
                <button type="button" onClick={deletePreset}>
                  Delete
                </button>
              )}
            </form>
            <div className="ag-buttons">
              <button type="button" onClick={saveFile}>
                Save file
              </button>
              <button type="button" onClick={() => fileRef.current?.click()}>
                Load file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  loadFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
            {note && (
              <p className="ag-note" role="status">
                {note}
              </p>
            )}
            <div className="ag-buttons">
              <button type="button" onClick={() => viewRef.current?.fit()}>
                Fit view
              </button>
              <button type="button" onClick={() => viewRef.current?.restartTrace()}>
                Replay
              </button>
              <button type="button" onClick={() => navigator.clipboard?.writeText(location.href)}>
                Copy link
              </button>
            </div>
          </section>
          <section className="ag-section">
            <h2 className="ag-heading">Look</h2>
            <ControlPanel schema={viewSchema} config={state.view as never} setConfig={setView} density="tight" />
          </section>
          <section className="ag-section">
            <h2 className="ag-heading">Curve</h2>
            <ControlPanel
              schema={curveSchema}
              config={{ turns: state.design.turns, samples: state.design.samples }}
              setConfig={(path, v) => setDesign({ ...state.design, [path]: v as number })}
              density="tight"
            />
            <StackEditor design={state.design} onChange={setDesign} />
          </section>
          <section className="ag-section">
            <h2 className="ag-heading">Export</h2>
            <div className="ag-buttons">
              {[1, 2, 4].map((k) => (
                <button key={k} type="button" onClick={() => exportPNG(k)}>
                  PNG {k}×
                </button>
              ))}
            </div>
            <div className="ag-buttons">
              <label className="ag-inline">
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={recordSeconds}
                  onChange={(e) => setRecordSeconds(Math.max(1, Number(e.target.value) || 1))}
                />
                s
              </label>
              <button type="button" onClick={record} disabled={recording}>
                {recording ? 'Recording…' : 'Record video'}
              </button>
            </div>
          </section>
        </aside>
      </div>
    </LabShell>
  );
}
