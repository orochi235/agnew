import { ControlPanel, f, isAuto, resolveConfigSchema } from '@weasel-js/labkit';
import { AUTO, type Design } from 'agnew';
import { useAgnew } from '../session';
import { StackEditor } from '../StackEditor';

const curveSchema = resolveConfigSchema(
  f.schema({
    turns: f.number(1).range(0.25, 60).step(0.25).label('Turns').manual(),
    samples: f
      .number(8000)
      .range(500, 150000)
      .step(500)
      .label('Samples')
      .describe('Click the label for auto: enough points that each segment is short beside the curve.'),
  }),
);

/** The design: how long it runs, how finely it is sampled, and its block stack. */
export function CurvePanel() {
  const { state, setState } = useAgnew();
  const setDesign = (design: Design) => setState((s) => ({ ...s, design, preset: '' }));
  return (
    <div className="ag-panel">
      <ControlPanel
        schema={curveSchema}
        config={{ turns: state.design.turns, samples: state.design.samples === AUTO ? 8000 : state.design.samples }}
        setConfig={(path, v) => setDesign({ ...state.design, [path]: isAuto(v) ? AUTO : (v as number) })}
        auto={state.design.samples === AUTO ? new Set(['samples']) : new Set<string>()}
        density="tight"
      />
      <StackEditor design={state.design} onChange={setDesign} />
    </div>
  );
}
