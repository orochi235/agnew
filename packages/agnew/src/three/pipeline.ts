import {
  Color,
  DirectionalLight,
  Fog,
  HalfFloatType,
  type PerspectiveCamera,
  PMREMGenerator,
  type Scene,
  type Texture,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { COLOR_SHADER, filterIndex } from './color.js';
import type { Box } from './framing.js';
import { paletteStops } from './palette.js';
import type { ViewSettings } from './settings.js';

/** The renderer, the passes it draws through, and the scene's lighting. */
export interface Pipeline {
  renderer: WebGLRenderer;
  /** Device pixels per CSS pixel the canvas draws at. */
  pixelRatio: number;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  envMap: Texture;
  dispose(): void;
}

/**
 * Builds the pipeline for `canvas`. `beforeOutput` runs once the scene and
 * bloom passes are in and before the output and color passes, for a caller
 * that adds passes of its own between them.
 */
export function createPipeline(
  canvas: HTMLCanvasElement,
  scene: Scene,
  camera: PerspectiveCamera,
  bloomStrength: number,
  beforeOutput: (p: Pipeline) => void,
): Pipeline & { colorPass: ShaderPass; key: DirectionalLight } {
  const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);

  const pmrem = new PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new DirectionalLight(0xffffff, 2);
  key.position.set(2, 3, 4);
  scene.add(key);

  const target = new WebGLRenderTarget(1, 1, { samples: 4, type: HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new Vector2(1, 1), bloomStrength, 0.45, 0);
  composer.addPass(bloom);

  const pipeline: Pipeline = {
    renderer,
    pixelRatio,
    composer,
    bloom,
    envMap,
    dispose() {
      composer.dispose();
      target.dispose();
      envMap.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
  beforeOutput(pipeline);
  composer.addPass(new OutputPass());
  const colorPass = new ShaderPass(COLOR_SHADER);
  colorPass.enabled = false;
  composer.addPass(colorPass);
  return { ...pipeline, colorPass, key };
}

/** Puts `settings`' background, fog, lighting, bloom and color filter on the
 *  pipeline. Returns whether the background is light. */
export function paintSettings(
  p: Pipeline & { colorPass: ShaderPass; key: DirectionalLight },
  scene: Scene,
  s: ViewSettings,
  bloomStrength: number,
): boolean {
  const bg = new Color(s.background);
  scene.background = bg;
  scene.fog = s.style === 'ink' ? new Fog(bg, 1, 10) : null;
  const meshStyle = s.style === 'tube' || s.style === 'ribbon';
  scene.environment = meshStyle ? p.envMap : null;
  p.key.visible = meshStyle;
  p.bloom.strength = bloomStrength;
  p.bloom.enabled = bloomStrength > 0;
  const color = p.colorPass;
  color.enabled = s.hue !== 0 || s.filter !== 'none';
  color.uniforms.hue.value = (s.hue * Math.PI) / 180;
  color.uniforms.mode.value = filterIndex(s.filter);
  color.uniforms.dark.value = bg.toArray();
  color.uniforms.light.value = new Color(paletteStops(s.palette)[0]).toArray();
  return bg.getHSL({ h: 0, s: 0, l: 0 }).l > 0.5;
}

/** Sizes the pipeline to a `width` × `height` canvas, its camera composed for `frame`. */
export function sizePipeline(p: Pipeline, camera: PerspectiveCamera, width: number, height: number, frame: Box, fov: number) {
  p.renderer.setPixelRatio(p.pixelRatio);
  p.renderer.setSize(width, height, false);
  p.composer.setPixelRatio(p.pixelRatio);
  p.composer.setSize(width, height);
  camera.aspect = frame.width / frame.height;
  camera.fov = fov;
  camera.setViewOffset(frame.width, frame.height, -frame.x, -frame.y, width, height);
  camera.updateProjectionMatrix();
}
