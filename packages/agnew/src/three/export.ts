import { HalfFloatType, type PerspectiveCamera, ShaderMaterial, type Texture, Vector2, type WebGLRenderer, WebGLRenderTarget } from 'three';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import type { Box } from './framing.js';

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

export interface RecordOptions {
  fps?: number;
  /** Start from the beginning of the loop when recording starts. */
  restartTrace?: boolean;
  /** Video bits per second. */
  bitrate?: number;
}

/** What the exporter needs from the view it exports. */
export interface ExportHost {
  canvas: HTMLCanvasElement;
  renderer: WebGLRenderer;
  composer: EffectComposer;
  camera: PerspectiveCamera;
  bloom: UnrealBloomPass;
  pixelRatio(): number;
  frameBox(): Box;
  resize(): void;
  renderFrame(dt: number): void;
  lines(): { material: LineMaterial; width: number }[];
  setDotScale(pixelRatio: number): void;
  restart(): void;
}

/** PNG and WebM export of a view. Adds its bloom-tiling pass to the
 *  composer, so it is made before the composer's last passes. */
export function createExporter(host: ExportHost) {
  const tileBloom = new ShaderPass(TILE_BLOOM_SHADER);
  tileBloom.enabled = false;
  host.composer.addPass(tileBloom);
  const copyQuad = new FullScreenQuad(new ShaderMaterial(CopyShader));

  /**
   * The frame at `scale` times the on-screen resolution, drawn in tiles small
   * enough for any GPU to allocate. Bloom is a screen-space blur, so it is
   * computed once from the whole frame at screen resolution and added into
   * each sharp tile — blooming tiles separately would seam at their edges and
   * shrink the glow.
   */
  function renderTiled(scale: number): HTMLCanvasElement {
    const { canvas, renderer, composer, camera, bloom } = host;
    const frame = host.frameBox();
    const { width: cw, height: ch } = frame;
    // The bloom is computed over the whole canvas; the frame is a part of it.
    const canvasW = Math.max(1, canvas.clientWidth);
    const canvasH = Math.max(1, canvas.clientHeight);
    let W = Math.round(cw * host.pixelRatio() * scale);
    let H = Math.round(ch * host.pixelRatio() * scale);
    const fitK = Math.min(1, Math.sqrt(MAX_EXPORT_PIXELS / (W * H)), MAX_EXPORT_SIDE / Math.max(W, H));
    if (fitK < 1) {
      console.warn(`agnew: export capped at ${Math.floor(W * fitK)}×${Math.floor(H * fitK)} (asked ${W}×${H})`);
      W = Math.floor(W * fitK);
      H = Math.floor(H * fitK);
    }
    const pxScale = W / cw; // device pixels per CSS pixel in the export

    host.resize();
    host.renderFrame(0);
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
          for (const { material, width } of host.lines()) {
            material.resolution.set(tw, th);
            material.linewidth = width * pxScale;
          }
          host.setDotScale(pxScale);
          tileBloom.uniforms.offset.value.set(
            (frame.x + (x / W) * frame.width) / canvasW,
            (frame.y + (y / H) * frame.height) / canvasH,
          );
          tileBloom.uniforms.span.value.set(((tw / W) * frame.width) / canvasW, ((th / H) * frame.height) / canvasH);
          composer.render(0);
          g.drawImage(canvas, 0, 0, tw, th, x, y, tw, th);
        }
      }
    } finally {
      camera.clearViewOffset();
      bloom.enabled = bloomWasOn;
      tileBloom.enabled = false;
      bloomCopy?.dispose();
      host.resize();
    }
    return out;
  }

  return {
    async exportPNG(scale = 2): Promise<Blob> {
      return new Promise<Blob>((resolve, reject) =>
        renderTiled(scale).toBlob((b) => (b ? resolve(b) : reject(new Error('agnew: PNG export failed'))), 'image/png'),
      );
    },
    record(seconds: number, options: RecordOptions = {}): Promise<Blob> {
      const { canvas } = host;
      // The canvas can be wider than the framed picture, so record a crop of
      // it rather than handing out the part nobody can see.
      let cropRaf = 0;
      let source: HTMLCanvasElement = canvas;
      const frame = host.frameBox();
      const ratio = host.pixelRatio();
      if (frame.width < canvas.clientWidth || frame.height < canvas.clientHeight) {
        const crop = document.createElement('canvas');
        crop.width = Math.round(frame.width * ratio);
        crop.height = Math.round(frame.height * ratio);
        const sx = Math.round(frame.x * ratio);
        const sy = Math.round(frame.y * ratio);
        const g = crop.getContext('2d')!;
        const paint = () => {
          cropRaf = requestAnimationFrame(paint);
          g.drawImage(canvas, sx, sy, crop.width, crop.height, 0, 0, crop.width, crop.height);
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
      if (options.restartTrace) host.restart();
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
      copyQuad.dispose();
      (copyQuad.material as ShaderMaterial).dispose();
    },
  };
}
