import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HalfFloatType,
  Line,
  LineBasicMaterial,
  LineSegments,
  type Material,
  Mesh,
  MeshPhysicalMaterial,
  NormalBlending,
  type Object3D,
  PerspectiveCamera,
  PMREMGenerator,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  type Texture,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { arcLengths, indexAtLength } from '../arclength.js';
import { type Curve, type Design, evaluate, evaluateAt, timeSpan } from '../design.js';
import { buildRibbon, buildTube, decimate, type SweptGeometry } from './geometry.js';
import { gradientColors, paletteStops } from './palette.js';

export type Style = 'neon' | 'tube' | 'ink' | 'ribbon';
export const STYLES: readonly Style[] = ['neon', 'tube', 'ink', 'ribbon'];

export interface ViewSettings {
  style: Style;
  /** A key of `PALETTES`. */
  palette: string;
  background: string;
  /** Line width in CSS pixels (neon, ink). */
  lineWidth: number;
  /** Line opacity. In neon it is additive and scaled down for dense curves
   *  (long relative to their size), so a harmonograph's core does not burn out. */
  lineOpacity: number;
  /** Tube radius as a fraction of the curve's radius. */
  tubeRadius: number;
  /** Ribbon width as a fraction of the curve's radius. */
  ribbonWidth: number;
  /** Full turns of the ribbon's face along the whole curve. */
  ribbonTwist: number;
  /** Bloom strength; 0 turns the pass off. */
  bloom: number;
  layers: { curve: boolean; trace: boolean; mechanism: boolean };
  /** How far the pen travels per second, in multiples of the curve's radius.
   *  The pen moves at this speed along the line, so a longer, more complex
   *  curve takes longer to draw. */
  traceSpeed: number;
  autoRotate: boolean;
}

/** What switching to a style should also change, so each one opens looking right. */
export const STYLE_DEFAULTS: Readonly<Record<Style, Partial<ViewSettings>>> = {
  neon: { palette: 'aurora', background: '#05060a', bloom: 0.9, lineWidth: 1.6, lineOpacity: 0.55 },
  tube: { palette: 'brass', background: '#0e1016', bloom: 0.15 },
  ink: { palette: 'ink', background: '#f3eee3', bloom: 0, lineWidth: 1.3, lineOpacity: 0.95 },
  ribbon: { palette: 'ice', background: '#0c0a14', bloom: 0.2 },
};

export const DEFAULT_VIEW: ViewSettings = {
  style: 'neon',
  palette: 'aurora',
  background: '#05060a',
  lineWidth: 1.6,
  lineOpacity: 0.55,
  tubeRadius: 0.012,
  ribbonWidth: 0.035,
  ribbonTwist: 40,
  bloom: 0.9,
  layers: { curve: true, trace: false, mechanism: false },
  traceSpeed: 4,
  autoRotate: true,
};

export interface RecordOptions {
  fps?: number;
  /** Start the pen from the beginning when recording starts. */
  restartTrace?: boolean;
  /** Video bits per second. */
  bitrate?: number;
}

export interface AgnewView {
  setDesign(design: Design): void;
  setSettings(patch: Partial<ViewSettings>): void;
  readonly settings: ViewSettings;
  /** Move the camera so the whole curve is in view, keeping its direction. */
  fit(): void;
  restartTrace(): void;
  /** Whether the pen, the mechanism and auto-rotation are running. */
  playing: boolean;
  /** How far along the curve the pen is, 0–1 by distance. Setting it moves
   *  the pen there. */
  progress: number;
  /**
   * Compose for a box smaller than the canvas, in CSS pixels. The picture
   * keeps the position and scale it had at that size and the canvas paints
   * past it — which is how art runs under a translucent panel without the
   * framing moving. Exports and recordings still cover the framed box only.
   */
  setFraming(box: { width: number; height: number } | null): void;
  /** A PNG of the current frame at `scale` times the on-screen resolution,
   *  rendered in tiles so large sizes work on any GPU. */
  exportPNG(scale?: number): Promise<Blob>;
  /** A WebM of the canvas for `seconds`. */
  record(seconds: number, options?: RecordOptions): Promise<Blob>;
  dispose(): void;
}

const MAX_MESH_POINTS = 24000;
/** Export tile edge in device pixels; small enough for any GPU's MSAA HDR target. */
const EXPORT_TILE = 2048;
/** Limits of a 2D canvas the browser will reliably allocate and encode. */
const MAX_EXPORT_SIDE = 16384;
const MAX_EXPORT_PIXELS = 120_000_000;

/** Adds a whole-frame bloom texture into one tile of it. */
const TILE_BLOOM_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tBloom: { value: null as Texture | null },
    offset: { value: new Vector2() },
    span: { value: new Vector2(1, 1) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tBloom;
    uniform vec2 offset;
    uniform vec2 span;
    varying vec2 vUv;
    void main() {
      // offset is measured from the top-left, uv from the bottom-left.
      vec2 full = vec2(offset.x + vUv.x * span.x, 1.0 - (offset.y + (1.0 - vUv.y) * span.y));
      gl_FragColor = texture2D(tDiffuse, vUv) + texture2D(tBloom, full);
    }`,
};
const MAX_JOINTS = 64;
/** How long a finished trace holds before the pen starts again. */
const TRACE_HOLD_SECONDS = 1.5;

export function createAgnewView(
  canvas: HTMLCanvasElement,
  init: {
    design?: Design;
    settings?: Partial<ViewSettings>;
    /** Called when the user starts dragging the camera. */
    onUserOrbit?: () => void;
  } = {},
): AgnewView {
  let settings: ViewSettings = { ...DEFAULT_VIEW, ...init.settings, layers: { ...DEFAULT_VIEW.layers, ...init.settings?.layers } };
  let design: Design | null = init.design ?? null;

  const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  let basePixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(basePixelRatio);

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.01, 100);
  camera.position.set(1.1, 0.9, 3.2);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.autoRotateSpeed = 0.6;
  let playing = true;
  /** Paused and not yet touched: the camera holds still instead of coasting
   *  on damping, so pausing lands on the angle it was at. */
  let cameraHeld = false;
  controls.addEventListener('start', () => {
    cameraHeld = false;
    init.onUserOrbit?.();
  });

  const pmrem = new PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new DirectionalLight(0xffffff, 2);
  key.position.set(2, 3, 4);
  scene.add(key);

  const target = new WebGLRenderTarget(1, 1, { samples: 4, type: HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new Vector2(1, 1), settings.bloom, 0.45, 0);
  composer.addPass(bloom);
  const tileBloom = new ShaderPass(TILE_BLOOM_SHADER);
  tileBloom.enabled = false;
  composer.addPass(tileBloom);
  composer.addPass(new OutputPass());
  const copyQuad = new FullScreenQuad(new ShaderMaterial(CopyShader));

  const curveGroup = new Group();
  const traceGroup = new Group();
  const mechGroup = new Group();
  scene.add(curveGroup, traceGroup, mechGroup);

  const glow = glowTexture();
  const pen = new Sprite(new SpriteMaterial({ map: glow, depthWrite: false, blending: AdditiveBlending }));
  scene.add(pen);

  // Mechanism: arms as a line through the joints, dots at the joints, and a
  // wireframe of any wrap surface.
  const armGeom = new BufferGeometry();
  armGeom.setAttribute('position', new BufferAttribute(new Float32Array(MAX_JOINTS * 3), 3));
  const armMat = new LineBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false });
  const arms = new Line(armGeom, armMat);
  const dotMat = new PointsMaterial({ size: 6, sizeAttenuation: false, transparent: true, depthWrite: false });
  const dots = new Points(armGeom, dotMat);
  const guideMat = new LineBasicMaterial({ transparent: true, opacity: 0.12, depthWrite: false });
  const guides = new LineSegments(new BufferGeometry(), guideMat);
  mechGroup.add(guides, arms, dots);
  for (const o of [arms, dots, guides]) o.frustumCulled = false;

  let curve: Curve | null = null;
  let built: Built | null = null;
  let dirty = true;
  /** Arc length the pen has drawn so far. */
  let traceS = 0;
  let holdLeft = 0;
  let cum: Float64Array = new Float64Array(1);
  let framing: { width: number; height: number } | null = null;

  interface Built {
    objects: Object3D[];
    materials: Material[];
    geometries: BufferGeometry[];
    /** Reveal the first `u` (0–1) of the trace copy. */
    reveal(u: number): void;
    lineMaterials: LineMaterial[];
    baseWidths: number[];
  }

  function disposeBuilt() {
    if (!built) return;
    for (const o of built.objects) o.removeFromParent();
    for (const m of built.materials) m.dispose();
    for (const g of built.geometries) g.dispose();
    built = null;
  }

  function rebuild() {
    dirty = false;
    disposeBuilt();
    if (!design) return;
    curve = evaluate(design);
    cum = arcLengths(curve.positions, curve.count);
    traceS = Math.min(traceS, curve.length);
    const s = settings;
    const bothOn = s.layers.curve && s.layers.trace;
    const dimOpacity = 0.14;

    if (s.style === 'neon' || s.style === 'ink') {
      const colors = gradientColors(curve.count, paletteStops(s.palette));
      const makeGeom = () => {
        const g = new LineGeometry();
        g.setPositions(curve!.positions);
        g.setColors(colors);
        return g;
      };
      const makeMat = (opacity: number) =>
        new LineMaterial({
          vertexColors: true,
          linewidth: s.lineWidth,
          transparent: true,
          opacity,
          depthWrite: s.style === 'ink',
          blending: s.style === 'neon' ? AdditiveBlending : NormalBlending,
          fog: s.style === 'ink',
          worldUnits: false,
        });
      const fullGeom = makeGeom();
      const traceGeom = makeGeom();
      const opacity = s.style === 'neon' ? s.lineOpacity * neonExposure(curve) : s.lineOpacity;
      const fullMat = makeMat(bothOn ? opacity * dimOpacity * 2 : opacity);
      const traceMat = makeMat(opacity);
      const full = new Line2(fullGeom, fullMat);
      const trace = new Line2(traceGeom, traceMat);
      curveGroup.add(full);
      traceGroup.add(trace);
      const segments = curve.count - 1;
      built = {
        objects: [full, trace],
        materials: [fullMat, traceMat],
        geometries: [fullGeom, traceGeom],
        lineMaterials: [fullMat, traceMat],
        baseWidths: [s.lineWidth, s.lineWidth],
        reveal: (u) => {
          traceGeom.instanceCount = Math.max(0, Math.floor(u * segments));
        },
      };
    } else {
      const dec = decimate(curve.positions, curve.count, MAX_MESH_POINTS);
      const colors = gradientColors(dec.count, paletteStops(s.palette));
      const size = Math.max(curve.radius, 1e-3);
      const swept: SweptGeometry =
        s.style === 'tube'
          ? buildTube(dec.positions, dec.count, colors, s.tubeRadius * size, dec.count > 12000 ? 6 : 8)
          : buildRibbon(dec.positions, dec.count, colors, s.ribbonWidth * size, s.ribbonTwist);
      const traceGeom = new BufferGeometry();
      for (const name of ['position', 'normal', 'color'] as const) {
        traceGeom.setAttribute(name, swept.geometry.getAttribute(name));
      }
      traceGeom.setIndex(swept.geometry.getIndex());
      traceGeom.boundingSphere = swept.geometry.boundingSphere;
      const makeMat = () =>
        s.style === 'tube'
          ? new MeshPhysicalMaterial({
              vertexColors: true,
              metalness: 0.95,
              roughness: 0.26,
              clearcoat: 0.3,
              envMap,
            })
          : new MeshPhysicalMaterial({
              vertexColors: true,
              metalness: 0.55,
              roughness: 0.22,
              side: DoubleSide,
              iridescence: 1,
              iridescenceIOR: 1.6,
              iridescenceThicknessRange: [200, 800],
              envMap,
            });
      const fullMat = makeMat();
      if (bothOn) {
        fullMat.transparent = true;
        fullMat.opacity = dimOpacity;
        fullMat.depthWrite = false;
      }
      const traceMat = makeMat();
      const full = new Mesh(swept.geometry, fullMat);
      const trace = new Mesh(traceGeom, traceMat);
      curveGroup.add(full);
      traceGroup.add(trace);
      built = {
        objects: [full, trace],
        materials: [fullMat, traceMat],
        geometries: [swept.geometry, traceGeom],
        lineMaterials: [],
        baseWidths: [],
        reveal: (u) => traceGeom.setDrawRange(0, swept.indicesUpTo(u * swept.segments)),
      };
    }
    applySettings();
  }

  function applySettings() {
    const s = settings;
    const bg = new Color(s.background);
    scene.background = bg;
    const light = bg.getHSL({ h: 0, s: 0, l: 0 }).l > 0.5;
    const mechColor = new Color(light ? '#1b1a2e' : '#ffffff');
    armMat.color = mechColor;
    dotMat.color = mechColor;
    guideMat.color = mechColor;
    guideMat.opacity = light ? 0.18 : 0.12;
    (pen.material as SpriteMaterial).blending = light ? NormalBlending : AdditiveBlending;
    (pen.material as SpriteMaterial).color = light ? new Color('#1b1a2e') : new Color('#ffffff');
    scene.fog = s.style === 'ink' ? new Fog(bg, 1, 10) : null;
    const meshStyle = s.style === 'tube' || s.style === 'ribbon';
    scene.environment = meshStyle ? envMap : null;
    key.visible = meshStyle;
    bloom.strength = s.bloom;
    bloom.enabled = s.bloom > 0;
    curveGroup.visible = s.layers.curve;
    traceGroup.visible = s.layers.trace;
    mechGroup.visible = s.layers.mechanism;
    controls.autoRotate = s.autoRotate && playing;
    resize();
  }

  function resize() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const frame = framing ?? { width: w, height: h };
    renderer.setPixelRatio(basePixelRatio);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(basePixelRatio);
    composer.setSize(w, h);
    camera.aspect = frame.width / frame.height;
    if (framing) camera.setViewOffset(frame.width, frame.height, 0, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    const res = new Vector2(w * basePixelRatio, h * basePixelRatio);
    if (built) {
      built.lineMaterials.forEach((m, i) => {
        m.resolution.copy(res);
        m.linewidth = built!.baseWidths[i] * basePixelRatio;
      });
    }
    dotMat.size = 6 * basePixelRatio;
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);

  function updateMechanism(t: number) {
    if (!design) return;
    const m = evaluateAt(design, t);
    const size = Math.max(curve?.radius ?? 1, 1e-3);
    pen.position.set(m.point[0], m.point[1], m.point[2]);
    pen.scale.setScalar(size * 0.09);
    const s = settings;
    pen.visible = s.layers.trace || s.layers.mechanism;
    if (!s.layers.mechanism) return;
    const joints = m.joints.slice(-MAX_JOINTS);
    const arr = armGeom.getAttribute('position') as BufferAttribute;
    joints.forEach((j, i) => arr.setXYZ(i, j[0], j[1], j[2]));
    arr.needsUpdate = true;
    armGeom.setDrawRange(0, joints.length);
    let nseg = 0;
    for (const line of m.guides) nseg += line.length - 1;
    const gpos = new Float32Array(nseg * 6);
    let w = 0;
    for (const line of m.guides) {
      for (let i = 1; i < line.length; i++) {
        gpos.set(line[i - 1], w);
        gpos.set(line[i], w + 3);
        w += 6;
      }
    }
    guides.geometry.dispose();
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(gpos, 3));
    guides.geometry = g;
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
    if (dirty) rebuild();
    const s = settings;
    if (playing && (s.layers.trace || s.layers.mechanism)) {
      if (holdLeft > 0) {
        holdLeft -= dt;
        if (holdLeft <= 0) traceS = 0;
      } else {
        const total = cum[cum.length - 1];
        traceS += s.traceSpeed * Math.max(curve?.radius ?? 1, 1e-3) * dt;
        if (traceS >= total) {
          traceS = total;
          holdLeft = TRACE_HOLD_SECONDS;
        }
      }
    }
    const u = cum.length > 1 ? indexAtLength(cum, traceS) / (cum.length - 1) : 0;
    built?.reveal(u);
    if (design) updateMechanism(u * timeSpan(design));
    if (scene.fog instanceof Fog && curve) {
      const d = camera.position.length();
      scene.fog.near = Math.max(0.01, d - curve.radius * 0.6);
      scene.fog.far = d + curve.radius * 4;
    }
    if (!cameraHeld) controls.update(dt);
    composer.render(dt);
  }

  raf = requestAnimationFrame(frame);

  /**
   * The frame at `scale` times the on-screen resolution, drawn in tiles small
   * enough for any GPU to allocate. Bloom is a screen-space blur, so it is
   * computed once from the whole frame at screen resolution and added into
   * each sharp tile — blooming tiles separately would seam at their edges and
   * shrink the glow.
   */
  function renderTiled(scale: number): HTMLCanvasElement {
    const cw = Math.max(1, framing?.width ?? canvas.clientWidth);
    const ch = Math.max(1, framing?.height ?? canvas.clientHeight);
    let W = Math.round(cw * basePixelRatio * scale);
    let H = Math.round(ch * basePixelRatio * scale);
    const fitK = Math.min(1, Math.sqrt(MAX_EXPORT_PIXELS / (W * H)), MAX_EXPORT_SIDE / Math.max(W, H));
    if (fitK < 1) {
      console.warn(`agnew: export capped at ${Math.floor(W * fitK)}×${Math.floor(H * fitK)} (asked ${W}×${H})`);
      W = Math.floor(W * fitK);
      H = Math.floor(H * fitK);
    }
    const pxScale = W / cw; // device pixels per CSS pixel in the export

    resize();
    renderFrame(0);
    let bloomCopy: WebGLRenderTarget | null = null;
    if (bloom.enabled) {
      const src = bloom.renderTargetsHorizontal[0];
      bloomCopy = new WebGLRenderTarget(src.width, src.height, { type: HalfFloatType });
      (copyQuad.material as ShaderMaterial).uniforms.tDiffuse.value = src.texture;
      renderer.setRenderTarget(bloomCopy);
      copyQuad.render(renderer);
      renderer.setRenderTarget(null);
    }

    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const g = out.getContext('2d')!;
    const bloomWasOn = bloom.enabled;
    bloom.enabled = false;
    tileBloom.enabled = !!bloomCopy;
    tileBloom.uniforms.tBloom.value = bloomCopy?.texture ?? null;
    renderer.setPixelRatio(1);
    composer.setPixelRatio(1);
    try {
      for (let y = 0; y < H; y += EXPORT_TILE) {
        for (let x = 0; x < W; x += EXPORT_TILE) {
          const tw = Math.min(EXPORT_TILE, W - x);
          const th = Math.min(EXPORT_TILE, H - y);
          renderer.setSize(tw, th, false);
          composer.setSize(tw, th);
          camera.setViewOffset(W, H, x, y, tw, th);
          if (built) {
            built.lineMaterials.forEach((m, i) => {
              m.resolution.set(tw, th);
              m.linewidth = built!.baseWidths[i] * pxScale;
            });
          }
          dotMat.size = 6 * pxScale;
          tileBloom.uniforms.offset.value.set(x / W, y / H);
          tileBloom.uniforms.span.value.set(tw / W, th / H);
          composer.render(0);
          g.drawImage(canvas, 0, 0, tw, th, x, y, tw, th);
        }
      }
    } finally {
      camera.clearViewOffset();
      bloom.enabled = bloomWasOn;
      tileBloom.enabled = false;
      bloomCopy?.dispose();
      resize();
    }
    return out;
  }

  function fit() {
    const r = Math.max(curve?.radius ?? (design ? evaluate({ ...design, samples: 2000 }).radius : 1), 0.05);
    const dist = (r / Math.sin(((camera.fov / 2) * Math.PI) / 180)) * 1.08;
    camera.position.setLength(dist);
    camera.near = dist / 100;
    camera.far = dist * 10;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
  }

  return {
    setDesign(d) {
      design = d;
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
        settings.layers.curve !== prev.layers.curve ||
        settings.layers.trace !== prev.layers.trace;
      if (settings.layers.trace && !prev.layers.trace) traceS = 0;
      if (needsRebuild) dirty = true;
      else applySettings();
    },
    get settings() {
      return settings;
    },
    fit,
    setFraming(box) {
      framing = box;
      resize();
    },
    get playing() {
      return playing;
    },
    set playing(on: boolean) {
      playing = on;
      cameraHeld = !on;
      controls.autoRotate = settings.autoRotate && playing;
    },
    get progress() {
      const total = cum[cum.length - 1];
      return total > 0 ? traceS / total : 0;
    },
    set progress(u: number) {
      traceS = Math.min(1, Math.max(0, u)) * cum[cum.length - 1];
      holdLeft = 0;
    },
    restartTrace() {
      traceS = 0;
      holdLeft = 0;
    },
    async exportPNG(scale = 2) {
      const blob = await new Promise<Blob>((resolve, reject) =>
        renderTiled(scale).toBlob((b) => (b ? resolve(b) : reject(new Error('agnew: PNG export failed'))), 'image/png'),
      );
      return blob;
    },
    record(seconds, options = {}) {
      // The canvas can be wider than the framed picture, so record a crop of
      // it rather than handing out the part nobody can see.
      let cropRaf = 0;
      let source: HTMLCanvasElement = canvas;
      if (framing) {
        const crop = document.createElement('canvas');
        crop.width = Math.round(framing.width * basePixelRatio);
        crop.height = Math.round(framing.height * basePixelRatio);
        const g = crop.getContext('2d')!;
        const paint = () => {
          cropRaf = requestAnimationFrame(paint);
          g.drawImage(canvas, 0, 0, crop.width, crop.height, 0, 0, crop.width, crop.height);
        };
        paint();
        source = crop;
      }
      const stream = source.captureStream(options.fps ?? 60);
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: options.bitrate ?? 16_000_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      if (options.restartTrace) {
        traceS = 0;
        holdLeft = 0;
      }
      return new Promise((resolve) => {
        rec.onstop = () => {
          if (cropRaf) cancelAnimationFrame(cropRaf);
          for (const tr of stream.getTracks()) tr.stop();
          resolve(new Blob(chunks, { type: mimeType ?? 'video/webm' }));
        };
        rec.start();
        setTimeout(() => rec.stop(), seconds * 1000);
      });
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      disposeBuilt();
      controls.dispose();
      composer.dispose();
      target.dispose();
      envMap.dispose();
      pmrem.dispose();
      glow.dispose();
      copyQuad.dispose();
      (copyQuad.material as ShaderMaterial).dispose();
      armGeom.dispose();
      guides.geometry.dispose();
      for (const m of [armMat, dotMat, guideMat, pen.material]) m.dispose();
      renderer.dispose();
    },
  };
}

/** Additive lines brighten with every overlap. Curves up to ~90 radii long
 *  look right at the set opacity; longer ones are dimmed toward it. */
function neonExposure(curve: Curve): number {
  const density = curve.length / Math.max(curve.radius, 1e-6);
  return Math.min(1, (90 / density) ** 0.7);
}

function glowTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.15)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}
