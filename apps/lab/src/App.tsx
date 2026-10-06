import { type ConfigOption, ControlPanel, f, LabShell, resolveConfigSchema, withValueAtPath } from '@weasel-js/labkit';
import { type Design, PRESETS, presetByName } from 'agnew';
import { type AgnewView, cameraPresetsFor, createAgnewView, FIT_MODES, frameAspect, PALETTES, SHAPE_NAMES, type Shape, SHAPES, shapeBox, STYLE_DEFAULTS, STYLES, type Style, type ViewSettings } from 'agnew/three';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parsePresetFile, presetFile, SAVED_PREFIX, useSavedPresets } from './saved';
import { useFlyKeys } from './flyKeys';
import { StackEditor } from './StackEditor';
import { Transport } from './Transport';
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
    fit: f
      .enum('orbit', [...FIT_MODES])
      .label('Fit')
      .describe('Orbit keeps the whole curve in view from any angle; tight fills the frame from this one.')
      .manual(),
    shape: f
      .enum(
        'free',
        SHAPE_NAMES.map((value) => ({ value, label: SHAPES[value].label })),
      )
      .label('Shape')
      .describe('Frame the picture as a rect of this shape, for a banner or a sidebar. Picking one zooms in and turns to the angle that fills it most.')
      .manual(),
    ratioW: f
      .number(30)
      .range(1, 200)
      .step(1)
      .input()
      .label('Width')
      .describe('The frame is Width : Height. Typing one switches the shape to Custom.')
      .manual()
      .showIf((c) => c.shape !== 'free'),
    ratioH: f
      .number(1)
      .range(1, 200)
      .step(1)
      .input()
      .label('Height')
      .manual()
      .showIf((c) => c.shape !== 'free'),
    stretch: f
      .boolean(false)
      .label('Stretch to shape')
      .describe("Scale the curve toward the shape's proportions so it fills the rect.")
      .manual()
      .showIf((c) => c.shape !== 'free'),
    azimuth: f
      .number(19)
      .range(-180, 180)
      .step(0.5)
      .label('Azimuth')
      .suffix('°')
      .describe('Camera direction around the vertical. 0 looks straight down the z axis.')
      .manual(),
    elevation: f
      .number(15)
      .range(-89, 89)
      .step(0.5)
      .label('Elevation')
      .suffix('°')
      .describe('Camera height above the horizon. Azimuth 0 and any elevation keeps the x axis level.')
      .manual(),
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

/** Dims everything outside the frame's shape. Its geometry is live, so it
 *  arrives as custom properties rather than a class. */
function ShapeOutline({ box }: { box: { x: number; y: number; width: number; height: number } }) {
  const vars = { '--x': `${box.x}px`, '--y': `${box.y}px`, '--w': `${box.width}px`, '--h': `${box.height}px` };
  return <div className="ag-shape" style={vars as CSSProperties} />;
}

/** `?bare` is the canvas alone, for embedding the lab as a picture. */
const BARE = new URLSearchParams(location.search).has('bare');

export function App() {
  const [state, setState] = useState<LabState>(initialState);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(10);
  const saved = useSavedPresets();
  const [name, setName] = useState(() => (state.preset.startsWith(SAVED_PREFIX) ? presetLabel(state.preset) : ''));
  const [note, setNote] = useState('');
  const [playing, setPlaying] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const viewRef = useRef<AgnewView | null>(null);

  useEffect(() => {
    const view = createAgnewView(canvasRef.current!, {
      design: state.design,
      settings: state.view,
      // A chosen angle should stay put.
      onUserOrbit: () =>
        setState((s) => (s.view.autoRotate ? { ...s, view: { ...s.view, autoRotate: false } } : s)),
      onCameraAngle: (angle) => setState((s) => ({ ...s, view: { ...s.view, ...angle } })),
    });
    viewRef.current = view;
    requestAnimationFrame(() => view.fit());
    // The view is created once; later changes flow through the effects below.
    return () => view.dispose();
  }, []);

  // The canvas spans the window, under the translucent sidebar; the picture
  // is composed for the clear area beside it.
  useEffect(() => {
    const box = viewportRef.current;
    if (!box) return;
    const apply = () => {
      viewRef.current?.setFraming(BARE ? null : { width: box.clientWidth, height: box.clientHeight });
      setArea({ width: box.clientWidth, height: box.clientHeight });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  useEffect(() => viewRef.current?.setDesign(state.design), [state.design]);
  useEffect(() => viewRef.current?.setSettings(state.view), [state.view]);
  const stopRotating = useCallback(
    () => setState((s) => (s.view.autoRotate ? { ...s, view: { ...s.view, autoRotate: false } } : s)),
    [],
  );
  useFlyKeys(viewRef, stopRotating);
  useEffect(() => viewRef.current?.fit(), [state.view.fit]);
  useEffect(() => {
    if (viewRef.current) viewRef.current.playing = playing;
  }, [playing]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, button, [contenteditable]')) return;
      e.preventDefault();
      setPlaying((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
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
      const named = path === 'shape' ? SHAPES[value as Shape].ratio : null;
      if (named) view = { ...view, ratioW: named[0], ratioH: named[1] };
      if ((path === 'ratioW' || path === 'ratioH') && SHAPES[view.shape].ratio) view = { ...view, shape: 'custom' };
      if ((path === 'shape' && value !== 'free') || path === 'ratioW' || path === 'ratioH') {
        view = { ...view, fit: 'tight', autoRotate: false };
        requestAnimationFrame(fillFrame);
      }
      return { ...s, view };
    });

  /** Turn to the angle that fills the frame most, once the new shape is laid out. */
  const fillFrame = () =>
    requestAnimationFrame(() => {
      const angle = viewRef.current?.bestAngle();
      if (angle) aimAt(angle.azimuth, angle.elevation);
    });

  const aimAt = (azimuth: number, elevation: number) => {
    setState((s) => ({ ...s, view: { ...s.view, azimuth, elevation, autoRotate: false } }));
    refit();
  };

  const exportPNG = async (scale: number) => {
    const blob = await viewRef.current?.exportPNG(scale);
    if (blob) download(blob, `${fileStem(presetLabel(state.preset))}@${scale}x.png`);
  };
  const record = async () => {
    const view = viewRef.current;
    if (!view || recording) return;
    setPlaying(true);
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

  // The canvas is a layer of its own under everything: the chrome floats over
  // it, and the sidebar is translucent.
  const canvas = <canvas ref={canvasRef} className="ag-canvas" />;

  if (BARE) return <div className="ag-bare">{canvas}</div>;

  return (
    <LabShell title="agnewgraph (rip ted)" mode="dark">
      <div className="ag-layout">
        {canvas}
        <div className="ag-viewport" ref={viewportRef}>
          {frameAspect(state.view) && <ShapeOutline box={shapeBox({ x: 0, y: 0, ...area }, frameAspect(state.view))} />}
          {!state.preset && <div className="ag-badge">custom</div>}
          <Transport
            view={viewRef}
            playing={playing}
            onPlayingChange={setPlaying}
            scrubbable={state.view.layers.trace || state.view.layers.mechanism}
          />
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
              <button
                type="button"
                onClick={() => {
                  viewRef.current?.restartTrace();
                  setPlaying(true);
                }}
              >
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
            <div className="ag-buttons">
              <button type="button" onClick={() => {
                setView('fit', 'tight');
                fillFrame();
              }}>
                Fill frame
              </button>
              {cameraPresetsFor(frameAspect(state.view)).map((c) => (
                <button key={c.label} type="button" onClick={() => aimAt(c.azimuth, c.elevation)}>
                  {c.label}
                </button>
              ))}
            </div>
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
