import { ControlPanel, f, resolveConfigSchema, type ResolvedConfig } from '@weasel-js/labkit';
import { EASES, type Ease, type KeysMotion, type Motion, newMotion, WAVE_SHAPES, type WaveMotion } from 'agnew';
import './MotionFields.css';

/** The slider a moving value lives on, which sizes a wave's depth. */
export interface Range {
  min: number;
  max: number;
  step: number;
}

const waveSchemas = new Map<string, ResolvedConfig>();
function waveSchema(range: Range): ResolvedConfig {
  const key = `${range.min}:${range.max}:${range.step}`;
  let s = waveSchemas.get(key);
  if (!s) {
    s = resolveConfigSchema(
      f.schema({
        shape: f.enum<string>('sine', WAVE_SHAPES).label('Shape').manual(),
        cycles: f.number(1).range(1, 32).step(1).label('Cycles per loop').manual(),
        depth: f
          .number(0)
          .range(0, range.max - range.min)
          .step(range.step)
          .label('Depth')
          .manual(),
        phase: f.number(0).range(0, 1).step(0.01).label('Phase').manual(),
      }),
    );
    waveSchemas.set(key, s);
  }
  return s;
}

const easeSchema = resolveConfigSchema(f.schema({ ease: f.enum<string>('linear', EASES).label('Ease').manual() }));

interface Props {
  motion: Motion;
  /** The value the motion starts from when switched to the other kind. */
  value: number;
  range: Range;
  onChange(motion: Motion): void;
}

/** One motion's settings: a wave's shape and size, or a list of keys. */
export function MotionFields({ motion, value, range, onChange }: Props) {
  return (
    <div className="ag-motion">
      <div className="ag-motion__kind">
        {(['wave', 'keys'] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={motion.kind === k}
            className="ag-btn"
            onClick={() => motion.kind !== k && onChange(newMotion(k, value, range.max - range.min))}
          >
            {k === 'wave' ? 'Wave' : 'Keys'}
          </button>
        ))}
      </div>
      {motion.kind === 'wave' ? <WaveFields wave={motion} range={range} onChange={onChange} /> : <KeysFields keys={motion} range={range} onChange={onChange} />}
    </div>
  );
}

function WaveFields({ wave, range, onChange }: { wave: WaveMotion; range: Range; onChange(m: Motion): void }) {
  return (
    <ControlPanel
      schema={waveSchema(range)}
      config={{ shape: wave.shape, cycles: wave.cycles, depth: wave.depth, phase: wave.phase }}
      setConfig={(path, v) => onChange({ ...wave, [path]: v } as WaveMotion)}
      density="tight"
    />
  );
}

function KeysFields({ keys, range, onChange }: { keys: KeysMotion; range: Range; onChange(m: Motion): void }) {
  const setStop = (i: number, patch: Partial<KeysMotion['stops'][number]>) =>
    onChange({ ...keys, stops: keys.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const sorted = (stops: KeysMotion['stops']) => [...stops].sort((a, b) => a.at - b.at);
  return (
    <>
      <ControlPanel
        schema={easeSchema}
        config={{ ease: keys.ease }}
        setConfig={(_p, v) => onChange({ ...keys, ease: v as Ease })}
        density="tight"
      />
      <table className="ag-keys">
        <thead>
          <tr>
            <th scope="col">At</th>
            <th scope="col">Value</th>
            <th scope="col">
              <span className="ag-visually-hidden">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {keys.stops.map((s, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stops have no identity but their place
            <tr key={i}>
              <td>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={s.at}
                  aria-label={`Stop ${i + 1} at`}
                  onChange={(e) => setStop(i, { at: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })}
                  onBlur={() => onChange({ ...keys, stops: sorted(keys.stops) })}
                />
              </td>
              <td>
                <input
                  type="number"
                  step={range.step}
                  value={s.value}
                  aria-label={`Stop ${i + 1} value`}
                  onChange={(e) => setStop(i, { value: Number(e.target.value) || 0 })}
                />
              </td>
              <td>
                <button
                  className="ag-btn"
                  type="button"
                  disabled={keys.stops.length < 2}
                  aria-label={`Remove stop ${i + 1}`}
                  onClick={() => onChange({ ...keys, stops: keys.stops.filter((_, j) => j !== i) })}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="ag-btn"
        type="button"
        onClick={() => {
          const lastStop = keys.stops[keys.stops.length - 1];
          onChange({ ...keys, stops: sorted([...keys.stops, { at: Math.min(1, (lastStop?.at ?? 0) + 0.1), value: lastStop?.value ?? 0 }]) });
        }}
      >
        Add stop
      </button>
    </>
  );
}
