import { ControlPanel } from '@weasel-js/labkit';
import { BLOCK_KINDS, type Block, blockKind, createBlock, type Design } from 'agnew';
import { useState } from 'react';
import { cachedParamSchema } from './schema';

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
                config={b.params}
                setConfig={(path, value) => update(b.id, { params: { ...b.params, [path]: value as never } })}
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
