import { Fog, Group, Scene, Vector2 } from 'three';
import { type Animator, animate } from '../animate.js';
import { indexAtLength } from '../arclength.js';
import type { EvalContext } from '../blocks.js';
import { type Design, evaluate, evaluateAt, timeSpan } from '../design.js';
import { AUTO } from '../params.js';
import type { AgnewView } from './api.js';
import { bestAngleFor, createAutoAngle, stretchedCurve } from './aim.js';
import { createCameraRig } from './camera.js';
import { loopTime, type ViewClock } from './clock.js';
import { createCurveStage } from './curveStage.js';
import { createExporter } from './export.js';
import { type Box, fovFor, frameAspect, shapeBox, stretchFor } from './framing.js';
import { needsRebuild, reshapes, resolveLook, usesAuto } from './look.js';
import { createMechanism } from './mechanism.js';
import { createPipeline, paintSettings, sizePipeline } from './pipeline.js';
import { spin, turnsCurve } from './rotation.js';
import { DEFAULT_VIEW, numberOr, type ViewSettings } from './settings.js';

export type { AgnewView } from './api.js';
export type { ViewClock } from './clock.js';
export type { RecordOptions } from './export.js';
export { DEFAULT_VIEW, STYLE_DEFAULTS, STYLES, type Style, type ViewSettings } from './settings.js';

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

  const scene = new Scene();
  const rig = createCameraRig(
    canvas,
    { azimuth: numberOr(settings.azimuth, 19), elevation: numberOr(settings.elevation, 15) },
    { onUserOrbit: init.onUserOrbit, onCameraAngle: init.onCameraAngle },
  );
  const { camera } = rig;
  let playing = true;
  let clock: ViewClock | null = null;
  const setPlaying = (on: boolean) => {
    playing = on;
    rig.held = !on;
    rig.setMotion(playing, settings.autoRotate);
  };
  const aim = () => rig.aim(angle());

  let exporter!: ReturnType<typeof createExporter>;
  const pipeline = createPipeline(canvas, scene, camera, numberOr(settings.bloom, 0.9), (p) => {
    exporter = createExporter({
      canvas,
      renderer: p.renderer,
      composer: p.composer,
      camera,
      bloom: p.bloom,
      pixelRatio: () => p.pixelRatio,
      frameBox,
      resize,
      renderFrame,
      lines: () => drawn.built?.lineMaterials.map((material, i) => ({ material, width: drawn.built!.baseWidths[i] })) ?? [],
      setDotScale: (r) => mechanism.setDotScale(r),
      restart: () => seekTime(0),
    });
  });
  const { composer, pixelRatio: basePixelRatio } = pipeline;

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

  const drawn = createCurveStage(curveGroup, traceGroup);
  let dirty = true;
  /** Seconds on the clock. */
  let time = 0;
  /** The moment last drawn, so a still clock does not redraw a moving curve. */
  let drawnAt = Number.NaN;
  let area: Box | null = null;

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
  const look = () => resolveLook(settings, frameBox(), drawn.curve);

  const autoAngle = createAutoAngle();
  /** The camera angle, with an `'auto'` side turned to fill the frame. */
  const angle = () => autoAngle(settings, drawn.curve, drawn.version, frameBox(), stage.scale);
  const findBestAngle = () => bestAngleFor(drawn.curve, stage.scale, frameBox());

  /** The frame's size or shape moved: anything worked out from it follows. */
  function frameChanged() {
    if (usesAuto(settings, design)) dirty = true;
  }

  function applyStretch(curve = drawn.curve) {
    const aspect = frameAspect(settings);
    if (settings.stretch && aspect && curve) stage.scale.set(...stretchFor(curve.positions, curve.count, aspect));
    else stage.scale.set(1, 1, 1);
  }

  function rebuild() {
    dirty = false;
    drawn.clear();
    if (!design || !animator) return;
    drawnAt = time;
    drawn.build(animator.at(time), context(), settings, pipeline.envMap, (curve) => {
      applyStretch(curve);
      return resolveLook(settings, frameBox(), curve);
    });
    applySettings();
  }

  function applySettings() {
    const s = settings;
    mechanism.setLight(paintSettings(pipeline, scene, s, look().bloom));
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
    sizePipeline(pipeline, camera, w, h, frame, fovFor(frame.width / frame.height));
    const res = new Vector2(w * basePixelRatio, h * basePixelRatio);
    const built = drawn.built;
    if (built) {
      built.lineMaterials.forEach((m, i) => {
        m.resolution.copy(res);
        m.linewidth = built.baseWidths[i] * basePixelRatio;
      });
    }
    mechanism.setDotScale(basePixelRatio);
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);

  const loopSeconds = () => Math.max(design?.loop ?? 1, 1e-3);

  function seekTime(seconds: number) {
    if (clock) clock.seek(seconds * 1000);
    else time = seconds;
  }

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
    if (clock) {
      if ((clock.rate !== 0) !== playing) setPlaying(clock.rate !== 0);
      time = loopTime(clock.elapsed, loopSeconds());
    } else if (playing) time = (time + dt) % loopSeconds();
    if (animator?.moving && time !== drawnAt) {
      drawnAt = time;
      if (!drawn.move(animator.at(time), context())) dirty = true;
    }
    const { cum, moment, curve } = drawn;
    const passes = Math.max(1, design?.passes ?? 1);
    const pass = (time / loopSeconds()) * passes;
    const total = cum[cum.length - 1];
    const u = cum.length > 1 ? indexAtLength(cum, (pass - Math.floor(pass)) * total) / (cum.length - 1) : 0;
    drawn.built?.reveal(u);
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
    const raw = drawn.curve ?? (design ? evaluate({ ...design, samples: 2000 }, context()) : null);
    rig.fit(raw && stretchedCurve(raw, stage.scale), settings.fit, settings.autoRotate);
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
      const reshaped = reshapes(prev, settings);
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
      if (needsRebuild(prev, settings)) dirty = true;
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
      rig.fly(right, up, forward, Math.max(drawn.curve?.radius ?? 1, 1e-3) * Math.max(stage.scale.x, stage.scale.y, stage.scale.z));
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
      setPlaying(on);
    },
    get progress() {
      return time / loopSeconds();
    },
    set progress(u: number) {
      const t = Math.min(1, Math.max(0, u)) * loopSeconds();
      seekTime(t >= loopSeconds() ? 0 : t);
    },
    get clock() {
      return clock;
    },
    set clock(c: ViewClock | null) {
      clock = c;
    },
    restartTrace() {
      seekTime(0);
    },
    exportPNG: (scale) => exporter.exportPNG(scale),
    record: (seconds, options) => exporter.record(seconds, options),
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      drawn.clear();
      rig.dispose();
      exporter.dispose();
      mechanism.dispose();
      pipeline.dispose();
    },
  };
}
