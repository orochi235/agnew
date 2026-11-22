import { ControlPanel, isAuto } from '@weasel-js/labkit';
import { EffectList, type EffectKind, type EffectListItem } from '@weasel-js/ui';
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

const KINDS: Record<string, EffectKind> = Object.fromEntries(
  BLOCK_KINDS.map((k, i) => [k.kind, { label: k.label, color: i }]),
);

interface Props {
  design: Design;
  onChange(design: Design): void;
}

/** The block stack: one card per block, numbered by its place in the stack and
 *  colored by its kind; the open card shows its control panel. */
export function StackEditor({ design, onChange }: Props) {
  const [adding, setAdding] = useState(BLOCK_KINDS[0].kind);
  const setBlocks = (blocks: Block[]) => onChange({ ...design, blocks });
  const update = (id: string, patch: Partial<Block>) =>
    setBlocks(design.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const [open, setOpen] = useState<string | null>(null);

  // Blocks have no names: a card's name is its kind's label, and onChange
  // reads back only order, `on` and removal, so a typed rename snaps back.
  const items = useMemo<EffectListItem[]>(
    () => design.blocks.map((b) => ({ id: b.id, kind: b.kind, name: blockKind(b.kind).label, on: b.enabled })),
    [design.blocks],
  );
  const byId = new Map(design.blocks.map((b) => [b.id, b]));

  // A disabled block keeps its body, dimmed.
  const body = (item: EffectListItem) => {
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
          spacing="tight"
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
      <EffectList
        className="ag-stack__list"
        aria-label="Blocks"
        items={items}
        kinds={KINDS}
        onChange={(next) => setBlocks(next.map((it) => ({ ...byId.get(it.id)!, enabled: it.on })))}
        selected={open}
        onSelectionChange={setOpen}
        renderBody={body}
      />
    </div>
  );
}
