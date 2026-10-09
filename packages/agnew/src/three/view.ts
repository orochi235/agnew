import {
  Color,
  DirectionalLight,
  Fog,
  Group,
  HalfFloatType,
  PMREMGenerator,
  Scene,
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
import { type Animator, animate } from '../animate.js';
import { arcLengths, indexAtLength } from '../arclength.js';
import type { EvalContext } from '../blocks.js';
import { type Curve, type Design, evaluate, evaluateAt, sampleCount, timeSpan } from '../design.js';
import { AUTO } from '../params.js';
import type { AgnewView } from './api.js';
import { createCameraRig } from './camera.js';
import { autoBloom, autoLineOpacity, autoLineWidth, coverage } from './auto.js';
import { type Built, buildCurve, neonExposure } from './build.js';
import { COLOR_SHADER, filterIndex } from './color.js';
import { createExporter } from './export.js';
import {
  bestAngle,
  type Box,
  fovFor,
  frameAspect,
  shapeBox,
  stretchFor,
} from './framing.js';
import { curveProgram } from './glsl.js';
import { createMechanism } from './mechanism.js';
import { paletteStops } from './palette.js';
import { spin, turnsCurve } from './rotation.js';
import { DEFAULT_VIEW, numberOr, type ViewSettings } from './settings.js';

export type { AgnewView } from './api.js';
export type { RecordOptions } from './export.js';
export { DEFAULT_VIEW, STYLE_DEFAULTS, STYLES, type Style, type ViewSettings } from './settings.js';

/** Points in the curve the pen and trace measure distance along, while the
 *  drawn line is evaluated on the GPU. */
const PEN_SAMPLES = 2000;

export function createAgnewView(
  canvas: HTMLCanvasElement,
  init: {
    design?: Design;
    settings?: Partial<ViewSettings>;
    /** Called when the user starts dragging the camera. */
    onUserOrbit?: () => void;
    /** Called when a drag of the camera ends, with the angle it ended at. */
    onCameraAngle?: (angle: { azimuth: number; elevation: number }) => void;
  } = {},
): AgnewView {
  let settings: ViewSettings = { ...DEFAULT_VIEW, ...init.settings, layers: { ...DEFAULT_VIEW.layers, ...init.settings?.layers } };
  let design: Design | null = init.design ?? null;
  let animator: Animator | null = design ? animate(design) : null;

  const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  const basePixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(basePixelRatio);

  const scene = new Scene();
  const rig = createCameraRig(
    canvas,
    { azimuth: numberOr(settings.azimuth, 19), elevation: numberOr(settings.elevation, 15) },
    { onUserOrbit: init.onUserOrbit, onCameraAngle: init.onCameraAngle },
  );
  const { camera } = rig;
  let playing = true;
  const aim = () => rig.aim(angle());

  const pmrem = new PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new DirectionalLight(0xffffff, 2);
  key.position.set(2, 3, 4);
  scene.add(key);

  const target = new WebGLRenderTarget(1, 1, { samples: 4, type: HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new Vector2(1, 1), numberOr(settings.bloom, 0.9), 0.45, 0);
  composer.addPass(bloom);
  const exporter = createExporter({
    canvas,
    renderer,
    composer,
    camera,
    bloom,
    pixelRatio: () => basePixelRatio,
    frameBox,
    resize,
    renderFrame,
    lines: () => built?.lineMaterials.map((material, i) => ({ material, width: built!.baseWidths[i] })) ?? [],
    setDotScale: (r) => mechanism.setDotScale(r),
    restart: () => {
      time = 0;
    },
  });
  composer.addPass(new OutputPass());
  const colorPass = new ShaderPass(COLOR_SHADER);
  colorPass.enabled = false;
  composer.addPass(colorPass);

  const curveGroup = new Group();
  const traceGroup = new Group();
  const mechanism = createMechanism();
  /** Everything drawn from the curve, so a stretch scales it all together. */
  const stage = new Group();
  /** Turns the stage for the auto-rotate modes that move the curve, outside
   *  the stretch so a stretched curve turns as one shape. */
  const spinner = new Group();
  scene.add(spinner);
  spinner.add(stage);
  stage.add(curveGroup, traceGroup, mechanism.group, mechanism.pen);

  /** The curve as last fully built, which framing and the automatic look read. */
  let curve: Curve | null = null;
  /** The design fixed at the clock's moment. */
  let moment: Design | null = null;
  let built: Built | null = null;
  let dirty = true;
  /** Seconds on the clock. */
  let time = 0;
  /** The moment last drawn, so a still clock does not redraw a moving curve. */
  let drawnAt = Number.NaN;
  /** Samples of the last full build, kept while the curve moves so its geometry keeps its size. */
  let samples = 2;
  /** Cumulative arc length along the curve the pen follows. */
  let cum: Float64Array = new Float64Array(1);
  let area: Box | null = null;
  let curveVersion = 0;

  /** The box the picture is composed for, in canvas CSS pixels. */
  function frameBox(): Box {
    const base = area ?? { x: 0, y: 0, width: Math.max(1, canvas.clientWidth), height: Math.max(1, canvas.clientHeight) };
    return shapeBox(base, frameAspect(settings));
  }

  /** What blocks with `'auto'` params can see: the frame's proportions. */
  function context(): EvalContext {
    const f = frameBox();
    return { aspect: f.width / f.height };
  }

  /** Line width, opacity and bloom with any `'auto'` worked out. */
  function look(): { lineWidth: number; lineOpacity: number; bloom: number } {
    const s = settings;
    const frame = frameBox();
    const lineWidth = s.lineWidth === AUTO ? autoLineWidth(frame) : s.lineWidth;
    const cover = curve ? coverage(curve, frame, lineWidth) : 1;
    const lineOpacity =
      s.lineOpacity === AUTO
        ? autoLineOpacity(s.style, cover)
        : s.style === 'neon' && curve
          ? s.lineOpacity * neonExposure(curve)
          : s.lineOpacity;
    const bloomStrength = s.bloom === AUTO ? autoBloom(s.style, cover) : s.bloom;
    return { lineWidth, lineOpacity, bloom: bloomStrength };
  }

  let autoAngle: { key: string; value: { azimuth: number; elevation: number } } | null = null;
  /** The camera angle, with an `'auto'` side turned to fill the frame. */
  function angle(): { azimuth: number; elevation: number } {
    const s = settings;
    if (s.azimuth !== AUTO && s.elevation !== AUTO) return { azimuth: s.azimuth, elevation: s.elevation };
    const f = frameBox();
    const key = `${curveVersion}:${(f.width / f.height).toFixed(4)}:${stage.scale.toArray().join()}`;
    if (autoAngle?.key !== key) autoAngle = { key, value: findBestAngle() };
    const best = autoAngle.value;
    return {
      azimuth: s.azimuth === AUTO ? best.azimuth : s.azimuth,
      elevation: s.elevation === AUTO ? best.elevation : s.elevation,
    };
  }

  function stretched(c: Curve): Float32Array {
    const k = stage.scale;
    const positions = new Float32Array(c.positions);
    for (let i = 0; i < c.count; i++) {
      positions[i * 3] *= k.x;
      positions[i * 3 + 1] *= k.y;
      positions[i * 3 + 2] *= k.z;
    }
    return positions;
  }

  function findBestAngle(): { azimuth: number; elevation: number } {
    if (!curve) return { azimuth: 19, elevation: 15 };
    const f = frameBox();
    return bestAngle(stretched(curve), curve.count, f.width / f.height);
  }

  /** The frame's size or shape moved: anything worked out from it follows. */
  function frameChanged() {
    if (usesAuto()) dirty = true;
  }

  function usesAuto(): boolean {
    const s = settings;
    if (s.lineWidth === AUTO || s.lineOpacity === AUTO || s.bloom === AUTO) return true;
    if (s.azimuth === AUTO || s.elevation === AUTO) return true;
    return !!design?.blocks.some((b) => Object.values(b.params).includes(AUTO));
  }

  function applyStretch() {
    const aspect = frameAspect(settings);
    if (settings.stretch && aspect && curve) stage.scale.set(...stretchFor(curve.positions, curve.count, aspect));
    else stage.scale.set(1, 1, 1);
  }

  function disposeBuilt() {
    if (!built) return;
    for (const o of built.objects) o.removeFromParent();
    for (const m of built.materials) m.dispose();
    for (const g of built.geometries) g.dispose();
    built = null;
  }

  const onGpu = () => settings.gpu && (settings.style === 'neon' || settings.style === 'ink');

  function rebuild() {
    dirty = false;
    disposeBuilt();
    if (!design || !animator) return;
    const ctx = context();
    moment = animator.at(time);
    samples = sampleCount(moment, ctx);
    curve = evaluate({ ...moment, samples }, ctx);
    curveVersion += 1;
    drawnAt = time;
    applyStretch();
    cum = arcLengths(curve.positions, curve.count);
    const { lineWidth, lineOpacity } = look();
    const out = buildCurve({
      curve,
      program: onGpu() ? curveProgram(moment, ctx) : undefined,
      settings,
      lineWidth,
      lineOpacity,
      envMap,
    });
    curveGroup.add(out.full);
    traceGroup.add(out.trace);
    built = out.built;
    applySettings();
  }

  /** Redraw a moving curve at the clock's moment, keeping what the last full
   *  build worked out: look, framing and camera angle. */
  function move() {
    if (!animator || !built) return;
    drawnAt = time;
    const ctx = context();
    moment = animator.at(time);
    if (built.gpu) {
      const program = curveProgram(moment, ctx);
      if (program.key !== built.gpu.key) {
        dirty = true;
        return;
      }
      built.gpu.update(program);
      const pen = evaluate({ ...moment, samples: Math.min(samples, PEN_SAMPLES) }, ctx);
      cum = arcLengths(pen.positions, pen.count);
    } else {
      const next = evaluate({ ...moment, samples }, ctx);
      built.reshape(next);
      cum = arcLengths(next.positions, next.count);
    }
  }

  function applySettings() {
    const s = settings;
    const bg = new Color(s.background);
    scene.background = bg;
    const light = bg.getHSL({ h: 0, s: 0, l: 0 }).l > 0.5;
    mechanism.setLight(light);
    scene.fog = s.style === 'ink' ? new Fog(bg, 1, 10) : null;
    const meshStyle = s.style === 'tube' || s.style === 'ribbon';
    scene.environment = meshStyle ? envMap : null;
    key.visible = meshStyle;
    const strength = look().bloom;
    bloom.strength = strength;
    bloom.enabled = strength > 0;
    colorPass.enabled = s.hue !== 0 || s.filter !== 'none';
    colorPass.uniforms.hue.value = (s.hue * Math.PI) / 180;
    colorPass.uniforms.mode.value = filterIndex(s.filter);
    colorPass.uniforms.dark.value = bg.toArray();
    colorPass.uniforms.light.value = new Color(paletteStops(s.palette)[0]).toArray();
    curveGroup.visible = s.layers.curve;
    traceGroup.visible = s.layers.trace;
    mechanism.group.visible = s.layers.mechanism;
    rig.setMotion(playing, s.autoRotate);
    resize();
  }

  function resize() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const frame = frameBox();
    renderer.setPixelRatio(basePixelRatio);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(basePixelRatio);
    composer.setSize(w, h);
    camera.aspect = frame.width / frame.height;
    camera.fov = fovFor(camera.aspect);
    camera.setViewOffset(frame.width, frame.height, -frame.x, -frame.y, w, h);
    camera.updateProjectionMatrix();
    const res = new Vector2(w * basePixelRatio, h * basePixelRatio);
    if (built) {
      built.lineMaterials.forEach((m, i) => {
        m.resolution.copy(res);
        m.linewidth = built!.baseWidths[i] * basePixelRatio;
      });
    }
    mechanism.setDotScale(basePixelRatio);
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);

  const loopSeconds = () => Math.max(design?.loop ?? 1, 1e-3);

  let last = performance.now();
  let raf = 0;
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    renderFrame(dt);
  }

  function renderFrame(dt: number) {
    if (dirty) {
      rebuild();
      if (settings.azimuth === AUTO || settings.elevation === AUTO) {
        aim();
        fit();
      }
    }
    const s = settings;
    if (playing) time = (time + dt) % loopSeconds();
    if (animator?.moving && time !== drawnAt) move();
    const passes = Math.max(1, design?.passes ?? 1);
    const pass = (time / loopSeconds()) * passes;
    const total = cum[cum.length - 1];
    const u = cum.length > 1 ? indexAtLength(cum, (pass - Math.floor(pass)) * total) / (cum.length - 1) : 0;
    built?.reveal(u);
    if (moment && (s.layers.trace || s.layers.mechanism)) {
      const m = evaluateAt(moment, u * timeSpan(moment), context());
      mechanism.update(m, Math.max(curve?.radius ?? 1, 1e-3), true, s.layers.mechanism);
    } else {
      mechanism.pen.visible = false;
    }
    if (scene.fog instanceof Fog && curve) {
      const d = camera.position.length();
      scene.fog.near = Math.max(0.01, d - curve.radius * 0.6);
      scene.fog.far = d + curve.radius * 4;
    }
    if (playing) spin(spinner, s.autoRotate, dt, rig.thrown);
    rig.update(dt);
    composer.render(dt);
  }

  raf = requestAnimationFrame(frame);

  function fit() {
    const raw = curve ?? (design ? evaluate({ ...design, samples: 2000 }, context()) : null);
    const k = stage.scale;
    const c =
      raw && (k.x !== 1 || k.y !== 1 || k.z !== 1)
        ? { ...raw, positions: stretched(raw), radius: raw.radius * Math.max(k.x, k.y, k.z) }
        : raw;
    rig.fit(c, settings.fit, settings.autoRotate);
  }

  return {
    setDesign(d) {
      design = d;
      animator = animate(d);
      time %= loopSeconds();
      dirty = true;
    },
    setSettings(patch) {
      const prev = settings;
      settings = { ...prev, ...patch, layers: { ...prev.layers, ...patch.layers } };
      const needsRebuild =
        settings.style !== prev.style ||
        settings.palette !== prev.palette ||
        settings.lineWidth !== prev.lineWidth ||
        settings.lineOpacity !== prev.lineOpacity ||
        settings.tubeRadius !== prev.tubeRadius ||
        settings.ribbonWidth !== prev.ribbonWidth ||
        settings.ribbonTwist !== prev.ribbonTwist ||
        settings.gpu !== prev.gpu ||
        settings.layers.curve !== prev.layers.curve ||
        settings.layers.trace !== prev.layers.trace;
      const reshaped =
        settings.shape !== prev.shape ||
        settings.stretch !== prev.stretch ||
        settings.ratioW !== prev.ratioW ||
        settings.ratioH !== prev.ratioH;
      if (reshaped) {
        resize();
        applyStretch();
        frameChanged();
      }
      if (settings.azimuth !== prev.azimuth || settings.elevation !== prev.elevation) aim();
      if (settings.autoRotate !== prev.autoRotate) {
        spinner.rotation.set(0, 0, 0);
        rig.thrown = null;
      }
      const spinChanged = turnsCurve(settings.autoRotate) !== turnsCurve(prev.autoRotate);
      if (reshaped || ((settings.azimuth !== prev.azimuth || settings.elevation !== prev.elevation || spinChanged) && settings.fit === 'tight')) fit();
      if (needsRebuild) dirty = true;
      else applySettings();
    },
    get settings() {
      return settings;
    },
    fit,
    bestAngle() {
      return findBestAngle();
    },
    resolved() {
      return { ...look(), ...angle() };
    },
    fly(right, up, forward) {
      rig.fly(right, up, forward, Math.max(curve?.radius ?? 1, 1e-3) * Math.max(stage.scale.x, stage.scale.y, stage.scale.z));
    },
    setFraming(box) {
      const before = frameBox();
      area = box ? { x: box.x ?? 0, y: box.y ?? 0, width: box.width, height: box.height } : null;
      resize();
      applyStretch();
      const after = frameBox();
      if (before.width !== after.width || before.height !== after.height) frameChanged();
    },
    get playing() {
      return playing;
    },
    set playing(on: boolean) {
      playing = on;
      rig.held = !on;
      rig.setMotion(playing, settings.autoRotate);
    },
    get progress() {
      return time / loopSeconds();
    },
    set progress(u: number) {
      time = Math.min(1, Math.max(0, u)) * loopSeconds();
      if (time >= loopSeconds()) time = 0;
    },
    restartTrace() {
      time = 0;
    },
    exportPNG: (scale) => exporter.exportPNG(scale),
    record: (seconds, options) => exporter.record(seconds, options),
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      disposeBuilt();
      rig.dispose();
      composer.dispose();
      target.dispose();
      envMap.dispose();
      pmrem.dispose();
      exporter.dispose();
      mechanism.dispose();
      renderer.dispose();
    },
  };
}
