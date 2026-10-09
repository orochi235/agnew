export {
  arm,
  BLOCK_KINDS,
  type BlockKind,
  blockKind,
  type EvalContext,
  decay,
  pendulum,
  precess,
  scaleBlock,
  torusKnot,
  torusPatch,
  wrapSphere,
  wrapTorus,
} from './blocks.js';
export { type Animator, animate, waveAt } from './animate.js';
export { arcLengths, indexAtLength } from './arclength.js';
export { decode, encode, portableDesign, sanitizeDesign } from './codec.js';
export {
  type Block,
  type Curve,
  createBlock,
  type Design,
  evaluate,
  evaluateAt,
  type Mechanism,
  type Morph,
  morphTarget,
  morphWeight,
  newBlockId,
  sampleCount,
  timeSpan,
} from './design.js';
export { type Frames, parallelTransport } from './frames.js';
export {
  AUTO,
  type Auto,
  type BooleanParam,
  type ChoiceParam,
  defaultParams,
  type NumberParam,
  type ParamSpec,
  type ParamValue,
  type ParamValues,
} from './params.js';
export {
  DEFAULT_LOOP,
  EASES,
  type Ease,
  type KeysMotion,
  type Motion,
  newMotion,
  sanitizeMotion,
  WAVE_SHAPES,
  type WaveMotion,
  type WaveShape,
} from './motion.js';
export { PRESETS, type Preset, presetByName } from './presets.js';
export type { Vec3 } from './vec.js';
