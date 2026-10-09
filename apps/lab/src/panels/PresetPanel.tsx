import { type ConfigOption, ControlPanel, f, resolveConfigSchema, usePresentation } from '@weasel-js/labkit';
import { PRESETS, presetByName } from 'agnew';
import { useMemo, useRef, useState } from 'react';
import { download, fileStem, presetLabel } from '../files';
import { parsePresetFile, presetFile, SAVED_PREFIX, useSavedPresets } from '../saved';
import { refit, useAgnew, useAgnewView } from '../session';
import type { LabState } from '../state';

/** The dropdown's value while the state matches no preset. */
const CUSTOM = 'custom';

/** Picking, saving and sharing presets, and the view's own actions. */
export function PresetPanel() {
  const { state, setState } = useAgnew();
  const viewRef = useAgnewView();
  const { enter: present } = usePresentation();
  const saved = useSavedPresets();
  const [name, setName] = useState(() => (state.preset.startsWith(SAVED_PREFIX) ? presetLabel(state.preset) : ''));
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const replace = (next: LabState) => setState((s) => ({ ...next, playing: s.playing }));
  const loadPreset = (value: string) => {
    setNote('');
    if (value.startsWith(SAVED_PREFIX)) {
      const p = saved.list.find((x) => SAVED_PREFIX + x.name === value);
      if (!p) return;
      replace({ ...p.state, preset: value });
      setName(p.name);
    } else {
      const p = presetByName(value);
      if (!p) return;
      setState((s) => ({ ...s, preset: value, design: p.design() }));
      setName('');
    }
    refit(viewRef);
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
      replace({ ...p.state, preset: '' });
      setName(p.name);
      setNote(`Loaded “${p.name}” from ${file.name}.`);
      refit(viewRef);
    } catch (e) {
      setNote((e as Error).message);
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
    <div className="ag-panel">
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
        <button className="ag-btn" type="submit">Save preset</button>
        {state.preset.startsWith(SAVED_PREFIX) && (
          <button className="ag-btn" type="button" onClick={deletePreset}>
            Delete
          </button>
        )}
      </form>
      <div className="ag-buttons">
        <button className="ag-btn" type="button" onClick={saveFile}>
          Save file
        </button>
        <button className="ag-btn" type="button" onClick={() => fileRef.current?.click()}>
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
        <button className="ag-btn" type="button" onClick={() => viewRef.current?.fit()}>
          Fit view
        </button>
        <button
          className="ag-btn"
          type="button"
          onClick={() => {
            viewRef.current?.restartTrace();
            setState((s) => ({ ...s, playing: true }));
          }}
        >
          Replay
        </button>
        <button className="ag-btn" type="button" onClick={() => navigator.clipboard?.writeText(location.href)}>
          Copy link
        </button>
        <button className="ag-btn" type="button" title="The picture alone. Escape returns." onClick={present}>
          Present
        </button>
      </div>
    </div>
  );
}
