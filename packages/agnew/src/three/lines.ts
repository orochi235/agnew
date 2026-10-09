import { Vector2 } from 'three';
import { LineMaterial, type LineMaterialParameters } from 'three/addons/lines/LineMaterial.js';

/** Uniforms a GPU-evaluated line reads its curve from; see `curveProgram`. */
export interface CurveUniforms {
  agP: { value: Float32Array };
  agSpan: { value: Vector2 };
  agMorph: { value: number };
}

export function curveUniforms(slots: number): CurveUniforms {
  return { agP: { value: new Float32Array(slots * 4) }, agSpan: { value: new Vector2() }, agMorph: { value: 0 } };
}

const VERTEX_ENDS = /vec4 start = modelViewMatrix \* vec4\( instanceStart, 1\.0 \);\s*vec4 end = modelViewMatrix \* vec4\( instanceEnd, 1\.0 \);/;

/**
 * A screen-space line material whose segments end flat instead of round.
 * Three draws each segment as its own quad with a round cap at both ends, so
 * at every joint two caps overlap; under additive blending that overlap is
 * drawn twice and the line looks beaded. Flat ends meet without overlapping.
 * The cost is a wedge on the outside of a sharp bend, too thin to see when
 * the curve is sampled densely.
 *
 * Given a `curve`, each segment's ends are evaluated on the GPU: the
 * geometry's positions hold only how far along the curve each end is, in x.
 */
export function flatEndedLineMaterial(
  params: LineMaterialParameters,
  curve?: { key: string; glsl: string; uniforms: CurveUniforms },
): LineMaterial {
  const material = new LineMaterial({ ...params, worldUnits: false });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      '#include <clipping_planes_fragment>\nif ( abs( vUv.y ) > 1.0 ) discard;',
    );
    if (!curve) return;
    Object.assign(shader.uniforms, curve.uniforms);
    if (!VERTEX_ENDS.test(shader.vertexShader)) throw new Error('agnew: three line shader changed; cannot evaluate on the GPU');
    shader.vertexShader = shader.vertexShader
      .replace(
        VERTEX_ENDS,
        `vec3 agA = agnewCurve( instanceStart.x );
        bool agGapA = agGap;
        vec3 agB = agnewCurve( instanceEnd.x );
        agSegmentGap = agGapA || agGap;
        vec4 start = modelViewMatrix * vec4( agA, 1.0 );
        vec4 end = modelViewMatrix * vec4( agB, 1.0 );`,
      )
      .replace('void main() {', `${curve.glsl}\nbool agSegmentGap;\nvoid agLineMain() {`)
      .concat('\nvoid main() {\n  agLineMain();\n  if ( agSegmentGap ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );\n}\n');
  };
  material.customProgramCacheKey = () => (curve ? `agnew-flat-ended:${curve.key}` : 'agnew-flat-ended');
  return material;
}
