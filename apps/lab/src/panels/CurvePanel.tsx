import { ControlPanel, f, isAuto, resolveConfigSchema } from '@weasel-js/labkit';
import { AUTO, type Design } from 'agnew';
import { useAgnew } from '../session';
import { StackEditor } from '../StackEditor';
import { MorphEditor } from './MorphEditor';

const curveSchema = resolveConfigSchema(
  f.schema({
    turns: f.number(1).range(0.25, 60).step(0.25).label('Turns').manual(),
    loop: f
      .number(12)
      .range(1, 120)
      .step(0.5)
      .label('Loop')
      .suffix(' s')
      .describe('Seconds before everything repeats: every motion runs whole cycles in it.')
      .manual(),
    passes: f.number(1).range(1, 20).step(1).label('Pen passes').describe('Times the pen draws the curve per loop.').manual(),
    samples: f
      .number(8000)
      .range(500, 150000)
      .step(500)
      .label('Samples')
      .describe('Click the label for auto: enough points that each segment is short beside the curve.'),
  }),
);

/** The design: how long it runs and loops, how finely it is sampled, what it morphs toward, and its block stack. */
export function CurvePanel() {
  const { state, setState } = useAgnew();
  const setDesign = (design: Design) => setState((s) => ({ ...s, design, preset: '' }));
  return (
    <div className="ag-panel">
      <ControlPanel
        schema={curveSchema}
        config={{
          turns: state.design.turns,
          loop: state.design.loop,
          passes: state.design.passes,
          samples: state.design.samples === AUTO ? 8000 : state.design.samples,
        }}
        setConfig={(path, v) => setDesign({ ...state.design, [path]: isAuto(v) ? AUTO : (v as number) })}
        auto={state.design.samples === AUTO ? new Set(['samples']) : new Set<string>()}
        density="tight"
      />
      <MorphEditor design={state.design} onChange={setDesign} />
      <StackEditor design={state.design} onChange={setDesign} />
    </div>
  );
}
