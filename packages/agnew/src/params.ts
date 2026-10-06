/** A block parameter described as plain data, so any UI can build a control
 *  for it without the library knowing about that UI. */
export type ParamSpec = NumberParam | BooleanParam | ChoiceParam;

interface ParamBase {
  key: string;
  label: string;
}

export interface NumberParam extends ParamBase {
  type: 'number';
  default: number;
  min: number;
  max: number;
  step: number;
  /** Shown after the value, e.g. `'°'`. Presentation only. */
  suffix?: string;
  /** Whether the value may be `'auto'`, worked out from context when the
   *  design is evaluated; see `BlockKind.autoParam`. */
  auto?: boolean;
  /** A new block starts with this param on `'auto'` rather than `default`. */
  startAuto?: boolean;
}

export interface BooleanParam extends ParamBase {
  type: 'boolean';
  default: boolean;
}

export interface ChoiceParam extends ParamBase {
  type: 'choice';
  default: string;
  options: readonly string[];
}

/** A value worked out from context rather than set: a block param, a
 *  design's samples, or a view setting. */
export const AUTO = 'auto';
export type Auto = typeof AUTO;

export type ParamValue = number | boolean | string;
export type ParamValues = Record<string, ParamValue>;

export function defaultParams(specs: readonly ParamSpec[]): ParamValues {
  const out: ParamValues = {};
  for (const s of specs) out[s.key] = s.type === 'number' && s.startAuto ? AUTO : s.default;
  return out;
}

export const num = (
  key: string,
  label: string,
  def: number,
  min: number,
  max: number,
  step: number,
  suffix?: string,
): NumberParam => ({ type: 'number', key, label, default: def, min, max, step, suffix });

export const choice = (
  key: string,
  label: string,
  def: string,
  options: readonly string[],
): ChoiceParam => ({ type: 'choice', key, label, default: def, options });

/** A number param that may also be `'auto'`, and starts that way. */
export const autoNum = (...args: Parameters<typeof num>): NumberParam => ({ ...num(...args), auto: true, startAuto: true });
