import { LineMaterial, type LineMaterialParameters } from 'three/addons/lines/LineMaterial.js';

/**
 * A screen-space line material whose segments end flat instead of round.
 * Three draws each segment as its own quad with a round cap at both ends, so
 * at every joint two caps overlap; under additive blending that overlap is
 * drawn twice and the line looks beaded. Flat ends meet without overlapping.
 * The cost is a wedge on the outside of a sharp bend, too thin to see when
 * the curve is sampled densely.
 */
export function flatEndedLineMaterial(params: LineMaterialParameters): LineMaterial {
  const material = new LineMaterial({ ...params, worldUnits: false });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      '#include <clipping_planes_fragment>\nif ( abs( vUv.y ) > 1.0 ) discard;',
    );
  };
  material.customProgramCacheKey = () => 'agnew-flat-ended';
  return material;
}
