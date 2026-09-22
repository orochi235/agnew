import { ControlPanel, f, LabShell, resolveConfigSchema, withValueAtPath } from '@weasel-js/labkit';
import { type Design, PRESETS, presetByName } from 'agnew';
import { type AgnewView, createAgnewView, PALETTES, STYLE_DEFAULTS, STYLES, type Style, type ViewSettings } from 'agnew/three';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StackEditor } from './StackEditor';
import { initialState, type LabState, writeHash } from './state';

const presetNames = PRESETS.map((p) => p.name);

const presetSchema = resolveConfigSchema(
  f.schema({ preset: f.enum(presetNames[0], presetNames).label('Preset').manual() }),
);

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
    traceSeconds: f.number(12).range(1, 120).step(1).label('Trace duration').suffix('s').manual(),
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

function fileStem(s: LabState) {
  return `agnew-${(s.preset || 'custom').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export function App() {
  const [state, setState] = useState<LabState>(initialState);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(10);
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
  const loadPreset = (name: string) => {
    const p = presetByName(name);
    if (!p) return;
    setState((s) => ({ ...s, preset: name, design: p.design() }));
    requestAnimationFrame(() => requestAnimationFrame(() => viewRef.current?.fit()));
  };
  const setView = (path: string, value: unknown) =>
    setState((s) => {
      let view = withValueAtPath(s.view, path, value) as ViewSettings;
      if (path === 'style') view = { ...view, ...STYLE_DEFAULTS[value as Style] };
      return { ...s, view };
    });

  const exportPNG = async (scale: number) => {
    const blob = await viewRef.current?.exportPNG(scale);
    if (blob) download(blob, `${fileStem(state)}@${scale}x.png`);
  };
  const record = async () => {
    const view = viewRef.current;
    if (!view || recording) return;
    setRecording(true);
    try {
      download(await view.record(recordSeconds, { restartTrace: true }), `${fileStem(state)}.webm`);
    } finally {
      setRecording(false);
    }
  };

  const presetConfig = useMemo(() => ({ preset: state.preset || presetNames[0] }), [state.preset]);

  return (
    <LabShell title="agnew" mode="dark">
      <div className="ag-layout">
        <div className="ag-viewport">
          <canvas ref={canvasRef} className="ag-canvas" />
          {!state.preset && <div className="ag-badge">custom</div>}
        </div>
        <aside className="ag-sidebar">
          <section className="ag-section">
            <ControlPanel schema={presetSchema} config={presetConfig} setConfig={(_p, v) => loadPreset(v as string)} />
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
