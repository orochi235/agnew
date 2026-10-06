import { ControlPanel, isAuto } from '@weasel-js/labkit';
import { AUTO, BLOCK_KINDS, type Block, blockKind, createBlock, type Design, type ParamSpec } from 'agnew';
import { useState } from 'react';
import { cachedParamSchema } from './schema';

/** Params with each `'auto'` shown as the spec's default, which is what
 *  labkit pins it back to. */
function pinnable(params: Block['params'], specs: readonly ParamSpec[]): Block['params'] {
  const out = { ...params };
  for (const spec of specs) if (out[spec.key] === AUTO) out[spec.key] = spec.default;
  return out;
}

interface Props {
  design: Design;
  onChange(design: Design): void;
}

/** The block stack: one card per block, each with its own control panel. */
export function StackEditor({ design, onChange }: Props) {
  const [adding, setAdding] = useState(BLOCK_KINDS[0].kind);
  const setBlocks = (blocks: Block[]) => onChange({ ...design, blocks });
  const update = (id: string, patch: Partial<Block>) =>
    setBlocks(design.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= design.blocks.length) return;
    const next = [...design.blocks];
    [next[i], next[j]] = [next[j], next[i]];
    setBlocks(next);
  };

  return (
    <div className="ag-stack">
      {design.blocks.map((b, i) => {
        const kind = blockKind(b.kind);
        return (
          <section key={b.id} className={b.enabled ? 'ag-card' : 'ag-card ag-card--off'}>
            <header className="ag-card__head">
              <label className="ag-card__title">
                <input
                  type="checkbox"
                  checked={b.enabled}
                  onChange={(e) => update(b.id, { enabled: e.target.checked })}
                  aria-label={`Enable ${kind.label}`}
                />
                <span>{kind.label}</span>
                <span className={`ag-tag ag-tag--${kind.role}`}>{kind.role}</span>
              </label>
              <span className="ag-card__actions">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === design.blocks.length - 1}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setBlocks(design.blocks.filter((x) => x.id !== b.id))}
                  aria-label="Remove"
                >
                  ✕
                </button>
              </span>
            </header>
            {b.enabled && (
              <ControlPanel
                schema={cachedParamSchema(b.kind, kind.params)}
                config={pinnable(b.params, kind.params)}
                setConfig={(path, value) => update(b.id, { params: { ...b.params, [path]: (isAuto(value) ? AUTO : value) as never } })}
                auto={new Set(Object.keys(b.params).filter((k) => b.params[k] === AUTO))}
                density="tight"
              />
            )}
          </section>
        );
      })}
      <div className="ag-add">
        <select value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Block to add">
          {BLOCK_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setBlocks([...design.blocks, createBlock(adding)])}>
          Add block
        </button>
      </div>
    </div>
  );
}
