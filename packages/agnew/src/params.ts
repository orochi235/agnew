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

export type ParamValue = number | boolean | string;
export type ParamValues = Record<string, ParamValue>;

export function defaultParams(specs: readonly ParamSpec[]): ParamValues {
  const out: ParamValues = {};
  for (const s of specs) out[s.key] = s.default;
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
