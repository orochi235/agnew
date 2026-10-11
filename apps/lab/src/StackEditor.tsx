import { ControlPanel, isAuto } from '@weasel-js/labkit';
import { LayerList, type LayerListItem, moveLayers } from '@weasel-js/ui';
import { AUTO, BLOCK_KINDS, type Block, blockKind, createBlock, type Design, type ParamSpec } from 'agnew';
import { useMemo, useState } from 'react';
import { BlockMotions } from './BlockMotions';
import { cachedParamSchema } from './schema';
import './StackEditor.css';

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

/** The block stack: one card per block, numbered and colored by its place in
 *  the stack, each with its own control panel. */
export function StackEditor({ design, onChange }: Props) {
  const [adding, setAdding] = useState(BLOCK_KINDS[0].kind);
  const setBlocks = (blocks: Block[]) => onChange({ ...design, blocks });
  const update = (id: string, patch: Partial<Block>) =>
    setBlocks(design.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const items = useMemo<LayerListItem[]>(
    () =>
      design.blocks.map((b, i) => {
        const kind = blockKind(b.kind);
        return {
          id: b.id,
          label: kind.label,
          title: (
            <span className="ag-card__title">
              <span>{kind.label}</span>
              <span className={`ag-tag ag-tag--${kind.role}`}>{kind.role}</span>
            </span>
          ),
          badge: i + 1,
          tone: i,
          visible: b.enabled,
        };
      }),
    [design.blocks],
  );
  const byId = new Map(design.blocks.map((b) => [b.id, b]));

  // A disabled block keeps its body, dimmed, so it stays a card in its color.
  const body = (item: LayerListItem) => {
    const b = byId.get(item.id);
    if (!b) return null;
    const kind = blockKind(b.kind);
    return (
      <div className={b.enabled ? 'ag-card__body' : 'ag-card__body ag-card__body--off'}>
        <ControlPanel
          schema={cachedParamSchema(b.kind, kind.params)}
          config={pinnable(b.params, kind.params)}
          setConfig={(path, value) => update(b.id, { params: { ...b.params, [path]: (isAuto(value) ? AUTO : value) as never } })}
          auto={new Set(Object.keys(b.params).filter((k) => b.params[k] === AUTO))}
          density="tight"
        />
        <BlockMotions block={b} onChange={(motion) => update(b.id, { motion })} />
      </div>
    );
  };

  return (
    <div className="ag-stack">
      <div className="ag-add">
        <select value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Block to add">
          {BLOCK_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        <button className="ag-btn" type="button" onClick={() => setBlocks([...design.blocks, createBlock(adding)])}>
          Add block
        </button>
      </div>
      <LayerList
        className="ag-stack__list"
        label="Blocks"
        items={items}
        onReorder={(move) => setBlocks(moveLayers(items, move).map((it) => byId.get(it.id)!))}
        onVisibilityChange={(id, visible) => update(id, { enabled: visible })}
        onRemove={(id) => setBlocks(design.blocks.filter((b) => b.id !== id))}
        renderBody={body}
      />
    </div>
  );
}
