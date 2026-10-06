import { ControlPanel, isAuto } from '@weasel-js/labkit';
import { DragGhost, DragGrip, useReorderDragList } from '@weasel-js/ui';
import { AUTO, BLOCK_KINDS, type Block, blockKind, createBlock, type Design, type ParamSpec } from 'agnew';
import { useMemo, useState } from 'react';
import { cachedParamSchema } from './schema';
import './StackEditor.css';

/** Params with each `'auto'` shown as the spec's default, which is what
 *  labkit pins it back to. */
function pinnable(params: Block['params'], specs: readonly ParamSpec[]): Block['params'] {
  const out = { ...params };
  for (const spec of specs) if (out[spec.key] === AUTO) out[spec.key] = spec.default;
  return out;
}

/** `blocks` with the `ids` moved to `target`, an index into `blocks` as it was before the move. */
function moveTo(blocks: readonly Block[], ids: readonly string[], target: number): Block[] {
  const moving = blocks.filter((b) => ids.includes(b.id));
  const rest = blocks.filter((b) => !ids.includes(b.id));
  const at = target - blocks.slice(0, target).filter((b) => ids.includes(b.id)).length;
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
}

interface Props {
  design: Design;
  onChange(design: Design): void;
}

/** The block stack: one card per block, each with its own control panel. */
export function StackEditor({ design, onChange }: Props) {
  const [adding, setAdding] = useState(BLOCK_KINDS[0].kind);
  const [list, setList] = useState<HTMLElement | null>(null);
  const setBlocks = (blocks: Block[]) => onChange({ ...design, blocks });
  const update = (id: string, patch: Partial<Block>) =>
    setBlocks(design.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const items = useMemo(() => design.blocks.map((b) => ({ id: b.id, label: blockKind(b.kind).label })), [design.blocks]);
  const drag = useReorderDragList({
    items,
    selectedIds: [],
    onReorder: (ids, target) => setBlocks(moveTo(design.blocks, ids, target)),
  });
  const { draggedIds, targetIndex, ghost } = drag.state;

  const head = (b: Block, i: number, ghosted: boolean) => {
    const kind = blockKind(b.kind);
    return (
      <header className="ag-card__head">
        <span className="ag-card__grip" {...(ghosted ? {} : drag.rowProps(b.id, i))}>
          <DragGrip size={13} />
        </span>
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
        {!ghosted && (
          <span className="ag-card__actions">
            <button className="ag-btn" type="button" onClick={() => drag.nudge(b.id, i, -1)} disabled={i === 0} aria-label="Move up">
              ↑
            </button>
            <button className="ag-btn"
              type="button"
              onClick={() => drag.nudge(b.id, i, 1)}
              disabled={i === design.blocks.length - 1}
              aria-label="Move down"
            >
              ↓
            </button>
            <button className="ag-btn"
              type="button"
              onClick={() => setBlocks(design.blocks.filter((x) => x.id !== b.id))}
              aria-label="Remove"
            >
              ✕
            </button>
          </span>
        )}
      </header>
    );
  };

  const cardClass = (b: Block, i: number) => {
    const cls = ['ag-card'];
    if (!b.enabled) cls.push('ag-card--off');
    if (draggedIds?.includes(b.id)) cls.push('ag-card--dragging');
    else if (targetIndex === i) cls.push('ag-card--drop-before');
    if (targetIndex === design.blocks.length && i === design.blocks.length - 1) cls.push('ag-card--drop-after');
    return cls.join(' ');
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
      <div
        className={draggedIds ? 'ag-stack__list ag-stack__list--dragging' : 'ag-stack__list'}
        ref={(node) => {
          drag.containerProps.ref(node);
          setList(node);
        }}
      >
        {design.blocks.map((b, i) => {
          const kind = blockKind(b.kind);
          return (
            <section key={b.id} className={cardClass(b, i)}>
              {head(b, i, false)}
              {b.enabled && (
                <ControlPanel
                  schema={cachedParamSchema(b.kind, kind.params)}
                  config={pinnable(b.params, kind.params)}
                  setConfig={(path, value) =>
                    update(b.id, { params: { ...b.params, [path]: (isAuto(value) ? AUTO : value) as never } })
                  }
                  auto={new Set(Object.keys(b.params).filter((k) => b.params[k] === AUTO))}
                  density="tight"
                />
              )}
            </section>
          );
        })}
      </div>
      {ghost && list ? (
        <DragGhost at={ghost} from={list}>
          {design.blocks.map((b, i) =>
            ghost.ids.includes(b.id) ? (
              <section key={b.id} className="ag-card">
                {head(b, i, true)}
              </section>
            ) : null,
          )}
        </DragGhost>
      ) : null}
    </div>
  );
}
