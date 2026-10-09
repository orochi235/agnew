import type { EvalContext } from '../blocks.js';
import { type Design, morphTarget, morphWeight, resolvedBlocks, timeSpan } from '../design.js';
import type { ParamValues } from '../params.js';

/**
 * Each block kind's `apply` as GLSL: statements that update `vec3 p` at time
 * `float t`, reading params through `q`. A number param reads a uniform, so it
 * can move without a recompile; a choice is fixed in the source. These are a
 * second copy of the blocks in `blocks.ts`, and must agree with them.
 */
type BlockGlsl = (q: (key: string) => string) => string;

const AXIS: Record<string, string> = { x: 'vec3(1.0, 0.0, 0.0)', y: 'vec3(0.0, 1.0, 0.0)', z: 'vec3(0.0, 0.0, 1.0)' };

export const BLOCK_GLSL: Readonly<Record<string, BlockGlsl>> = {
  arm: (q) => `{
    float a = ${q('freq')} * t + ${q('phase')} * AG_DEG;
    vec3 v = vec3(${q('radius')} * cos(a), ${q('radius')} * sin(a), 0.0);
    p += agRotY(agRotX(v, ${q('tiltX')} * AG_DEG), ${q('tiltY')} * AG_DEG);
  }`,
  pendulum: (q) => `{
    float s = ${q('amplitude')} * sin(${q('freq')} * t + ${q('phase')} * AG_DEG) * exp(-${q('damping')} * t / AG_TAU);
    p += ${q('axis')} * s;
  }`,
  torusKnot: (q) =>
    `p += agTorusAt(${q('R')}, ${q('r')}, ${q('p')} * t, ${q('q')} * t + ${q('phase')} * AG_DEG, ${q('unrollU')}, ${q('unrollV')});`,
  wrapSphere: (q) => `{
    float rr = ${q('radius')} + p.z;
    float polar = length(p.xy) * ${q('wrap')};
    float az = agAtan(p.y, p.x);
    p = vec3(rr * sin(polar) * cos(az), rr * sin(polar) * sin(az), rr * cos(polar));
  }`,
  wrapTorus: (q) =>
    `p = agTorusAt(${q('R')}, ${q('r')} + p.z, p.x * ${q('uScale')} + ${q('uDrift')} * t, p.y * ${q('vScale')} + ${q('vDrift')} * t, ${q('unrollU')}, ${q('unrollV')});`,
  torusPatch: (q) =>
    `p = agPatchAt(p, ${q('R')}, ${q('r')}, ${q('u0')} * AG_DEG, ${q('v0')} * AG_DEG, ${q('u1')} * AG_DEG, ${q('v1')} * AG_DEG, ${q('turn')} * AG_DEG, ${q('aspect')});`,
  decay: (q) => `p *= exp(-${q('rate')} * t / AG_TAU);`,
  precess: (q) => `p = agRotAxis(p, ${q('axis')}, ${q('rate')} * AG_DEG * t / AG_TAU);`,
  scale: (q) => `p *= vec3(${q('x')}, ${q('y')}, ${q('z')});`,
};

const HELPERS = /* glsl */ `
#define AG_PI 3.141592653589793
#define AG_TAU 6.283185307179586
#define AG_DEG 0.017453292519943295
bool agGap;
float agAtan(float y, float x) { return (x == 0.0 && y == 0.0) ? 0.0 : atan(y, x); }
vec3 agRotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
vec3 agRotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
vec3 agRotZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z); }
vec3 agRotAxis(vec3 v, vec3 axis, float a) { return axis.x > 0.5 ? agRotX(v, a) : axis.y > 0.5 ? agRotY(v, a) : agRotZ(v, a); }
vec3 agBend(float theta, float rho, float unroll) {
  float k = 1.0 - unroll;
  if (k < 1e-6) return vec3(rho * theta, 0.0, 0.0);
  float turn = k * theta;
  return vec3(rho * sin(turn) / k, rho * (1.0 - cos(turn)) / k, turn);
}
vec3 agTorusAt(float R, float r, float u, float v, float unrollU, float unrollV) {
  vec3 major = agBend(u + AG_PI / 2.0, R, unrollU);
  float outX = sin(major.z);
  float outY = -cos(major.z);
  vec3 tube = agBend(v + AG_PI / 2.0, r, unrollV);
  return vec3(major.x + outX * tube.x, -R + major.y + outY * tube.x, -r + tube.y);
}
vec3 agPatchAt(vec3 p, float R, float r, float u0, float v0, float u1, float v1, float turn, float aspect) {
  float rho = length(p.xy) - R;
  float u = agAtan(p.y, p.x);
  float v = agAtan(p.z, rho);
  float height = length(vec2(rho, p.z)) - r;
  float hu = abs(u1 - u0) / 2.0;
  float hv = abs(v1 - v0) / 2.0;
  float c = cos(turn), s = sin(turn);
  float du = u - (u0 + u1) / 2.0;
  float dv = v - (v0 + v1) / 2.0;
  for (int i = -2; i <= 2; i++) {
    for (int j = -2; j <= 2; j++) {
      float x = du + float(i) * AG_TAU;
      float y = dv + float(j) * AG_TAU;
      float a = c * x + s * y;
      float b = -s * x + c * y;
      if (abs(a) <= hu && abs(b) <= hv) return vec3(aspect * a / (2.0 * hu), b / (2.0 * hv), height);
    }
  }
  agGap = true;
  return vec3(0.0);
}
`;

/** One design's curve as a GLSL function `vec3 agnewCurve(float u)`, for u
 *  0–1 along it, setting `agGap` where the curve has a gap. */
export interface CurveProgram {
  /** Equal for two designs that can share a compiled program. */
  key: string;
  glsl: string;
  /** The values of `uniform vec4 agP[]`, this moment's number params. */
  values: Float32Array;
  /** Time spans of the curve and of any morph target. */
  span: [number, number];
  morph: number;
}

export function curveProgram(design: Design, context: EvalContext = {}): CurveProgram {
  const values: number[] = [];
  const keyParts: string[] = [];
  const stack = (blocks: { kind: string; params: ParamValues }[]): string =>
    blocks
      .map(({ kind, params }) => {
        const write = BLOCK_GLSL[kind];
        if (!write) throw new Error(`agnew: no GLSL for block kind "${kind}"`);
        const fixed: string[] = [];
        const code = write((key) => {
          const v = params[key];
          if (typeof v === 'number') {
            values.push(v);
            const i = values.length - 1;
            return `agP[${i >> 2}].${'xyzw'[i & 3]}`;
          }
          fixed.push(`${key}=${String(v)}`);
          return AXIS[String(v)] ?? (v ? '1.0' : '0.0');
        });
        keyParts.push(`${kind}(${fixed.join(',')})`);
        return code;
      })
      .join('\n    ');
  const own = stack(resolvedBlocks(design, context));
  const target = morphTarget(design);
  keyParts.push('|');
  const other = target ? stack(resolvedBlocks(target, context)) : '';
  // Packed four to a vec4: a float array takes a whole uniform vector per element.
  const slots = Math.max(1, Math.ceil(values.length / 4));
  while (values.length < slots * 4) values.push(0);
  const glsl = `
uniform vec4 agP[${slots}];
uniform vec2 agSpan;
uniform float agMorph;
${HELPERS}
vec3 agStack0(float t) {
  vec3 p = vec3(0.0);
  ${own}
  return p;
}
${
  target
    ? `vec3 agStack1(float t) {
  vec3 p = vec3(0.0);
  ${other}
  return p;
}`
    : ''
}
vec3 agnewCurve(float u) {
  agGap = false;
  vec3 a = agStack0(u * agSpan.x);
  ${
    target
      ? `bool gapA = agGap && agMorph < 1.0;
  agGap = false;
  vec3 b = agStack1(u * agSpan.y);
  agGap = gapA || (agGap && agMorph > 0.0);
  return mix(a, b, agMorph);`
      : 'return a;'
  }
}
`;
  return {
    key: `${keyParts.join(';')}#${slots}`,
    glsl,
    values: Float32Array.from(values),
    span: [timeSpan(design), target ? timeSpan(target) : 0],
    morph: morphWeight(design),
  };
}
