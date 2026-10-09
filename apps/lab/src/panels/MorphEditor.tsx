import { ControlPanel, f, resolveConfigSchema } from '@weasel-js/labkit';
import { type Design, PRESETS, presetByName } from 'agnew';
import { MotionFields } from '../MotionFields';
import { SAVED_PREFIX, useSavedPresets } from '../saved';

const NONE = '';
const WEIGHT_RANGE = { min: 0, max: 1, step: 0.01 };

const weightSchema = resolveConfigSchema(
  f.schema({
    weight: f
      .number(0.5)
      .range(0, 1)
      .step(0.01)
      .label('Morph')
      .describe('0 draws this curve, 1 the other, and between blends them point by point.')
      .manual(),
  }),
);

interface Props {
  design: Design;
  onChange(design: Design): void;
}

/** A second curve the design blends toward, and how far, which can move too. */
export function MorphEditor({ design, onChange }: Props) {
  const saved = useSavedPresets();
  const morph = design.morph;
  const pick = (value: string) => {
    if (value === NONE) {
      const { morph: _m, ...rest } = design;
      onChange(rest);
      return;
    }
    const other = value.startsWith(SAVED_PREFIX)
      ? saved.list.find((p) => SAVED_PREFIX + p.name === value)?.state.design
      : presetByName(value)?.design();
    if (!other) return;
    onChange({
      ...design,
      morph: { ...morph, weight: morph?.weight ?? 0.5, name: value, to: { blocks: other.blocks, turns: other.turns } },
    });
  };
  const known = morph?.name && (presetByName(morph.name) || saved.list.some((p) => SAVED_PREFIX + p.name === morph.name));

  return (
    <div className="ag-morph">
      <select value={morph ? (known ? morph.name : 'custom') : NONE} aria-label="Morph toward" onChange={(e) => pick(e.target.value)}>
        <option value={NONE}>No morph</option>
        {morph && !known && <option value="custom">Morph toward its own curve</option>}
        {PRESETS.map((p) => (
          <option key={p.name} value={p.name}>
            Morph toward {p.name}
          </option>
        ))}
        {saved.list.map((p) => (
          <option key={p.name} value={SAVED_PREFIX + p.name}>
            Morph toward {p.name} (saved)
          </option>
        ))}
      </select>
      {morph && (
        <>
          <ControlPanel
            schema={weightSchema}
            config={{ weight: morph.weight }}
            setConfig={(_p, v) => onChange({ ...design, morph: { ...morph, weight: v as number } })}
            density="tight"
          />
          {morph.motion ? (
            <>
              <button
                className="ag-btn"
                type="button"
                onClick={() => {
                  const { motion: _m, ...still } = morph;
                  onChange({ ...design, morph: still });
                }}
              >
                Hold the morph still
              </button>
              <MotionFields
                motion={morph.motion}
                value={morph.weight}
                range={WEIGHT_RANGE}
                onChange={(motion) => onChange({ ...design, morph: { ...morph, motion } })}
              />
            </>
          ) : (
            <button
              className="ag-btn"
              type="button"
              onClick={() => onChange({ ...design, morph: { ...morph, motion: { kind: 'wave', shape: 'sine', cycles: 1, depth: 0.5, phase: 0 } } })}
            >
              Animate the morph
            </button>
          )}
        </>
      )}
    </div>
  );
}
