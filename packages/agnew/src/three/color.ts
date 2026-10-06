/** Color treatments applied to the finished picture, after tone mapping. */
export type ColorFilter = 'none' | 'grayscale' | 'sepia' | 'invert' | 'duotone';
export const COLOR_FILTERS: readonly ColorFilter[] = ['none', 'grayscale', 'sepia', 'invert', 'duotone'];

const FILTER_INDEX: Record<ColorFilter, number> = { none: 0, grayscale: 1, sepia: 2, invert: 3, duotone: 4 };
export const filterIndex = (f: ColorFilter): number => FILTER_INDEX[f] ?? 0;

/**
 * Hue rotation turns colors around the gray axis, so grays stay gray and
 * lightness is kept; the filter runs after it. Duotone maps luma from the
 * background color to the ink color the view passes in.
 */
export const COLOR_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    hue: { value: 0 },
    mode: { value: 0 },
    dark: { value: [0, 0, 0] as number[] },
    light: { value: [1, 1, 1] as number[] },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float hue;
    uniform int mode;
    uniform vec3 dark;
    uniform vec3 light;
    varying vec2 vUv;
    vec3 rotateHue(vec3 c, float a) {
      const vec3 k = vec3(0.57735);
      float ca = cos(a);
      return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
    }
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = rotateHue(src.rgb, hue);
      float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
      if (mode == 1) c = vec3(y);
      else if (mode == 2) c = vec3(
        dot(c, vec3(0.393, 0.769, 0.189)),
        dot(c, vec3(0.349, 0.686, 0.168)),
        dot(c, vec3(0.272, 0.534, 0.131)));
      else if (mode == 3) c = 1.0 - c;
      else if (mode == 4) c = mix(dark, light, clamp(y, 0.0, 1.0));
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
    }`,
};
