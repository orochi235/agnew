export {
  arm,
  BLOCK_KINDS,
  type BlockKind,
  blockKind,
  decay,
  pendulum,
  precess,
  scaleBlock,
  torusKnot,
  wrapSphere,
  wrapTorus,
} from './blocks.js';
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
  newBlockId,
  timeSpan,
} from './design.js';
export { type Frames, parallelTransport } from './frames.js';
export {
  type BooleanParam,
  type ChoiceParam,
  defaultParams,
  type NumberParam,
  type ParamSpec,
  type ParamValue,
  type ParamValues,
} from './params.js';
export { PRESETS, type Preset, presetByName } from './presets.js';
export type { Vec3 } from './vec.js';
