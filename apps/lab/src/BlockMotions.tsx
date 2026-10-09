import { AUTO, type Block, blockKind, type Motion, type NumberParam, newMotion } from 'agnew';
import { MotionFields } from './MotionFields';
import './BlockMotions.css';

interface Props {
  block: Block;
  onChange(motion: Block['motion']): void;
}

/** The block's moving params: each one's motion, and a picker to start another. */
export function BlockMotions({ block, onChange }: Props) {
  const specs = blockKind(block.kind).params.filter((p): p is NumberParam => p.type === 'number');
  const motion = block.motion ?? {};
  const moving = specs.filter((s) => motion[s.key]);
  // A param on 'auto' has no value of its own for a wave to swing around.
  const still = specs.filter((s) => !motion[s.key] && block.params[s.key] !== AUTO);
  const set = (key: string, m: Motion | null) => {
    const next = { ...motion };
    if (m) next[key] = m;
    else delete next[key];
    onChange(Object.keys(next).length ? next : undefined);
  };
  const valueOf = (s: NumberParam) => {
    const v = block.params[s.key];
    return typeof v === 'number' ? v : s.default;
  };

  return (
    <div className="ag-motions">
      {moving.map((s) => (
        <div key={s.key} className="ag-motions__row">
          <div className="ag-motions__head">
            <span>{s.label} moves</span>
            <button className="ag-btn" type="button" aria-label={`Stop ${s.label} moving`} onClick={() => set(s.key, null)}>
              ✕
            </button>
          </div>
          <MotionFields motion={motion[s.key]} value={valueOf(s)} range={s} onChange={(m) => set(s.key, m)} />
        </div>
      ))}
      {still.length > 0 && (
        <select
          className="ag-motions__add"
          value=""
          aria-label="Animate a value"
          onChange={(e) => {
            const s = still.find((p) => p.key === e.target.value);
            if (s) set(s.key, newMotion('wave', valueOf(s), s.max - s.min));
          }}
        >
          <option value="">Animate a value…</option>
          {still.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
