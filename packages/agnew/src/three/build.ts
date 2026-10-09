import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  type Material,
  Mesh,
  MeshPhysicalMaterial,
  NormalBlending,
  type Object3D,
  type Texture,
} from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { Curve } from '../design.js';
import { buildRibbon, buildTube, decimate, dropGaps, gapSegments, type SweptGeometry } from './geometry.js';
import { flatEndedLineMaterial } from './lines.js';
import { gradientColors, paletteStops } from './palette.js';
import type { ViewSettings } from './settings.js';

const MAX_MESH_POINTS = 24000;
/** How far the full curve fades when the trace is drawn over it. */
const DIM_OPACITY = 0.14;

/** What one build of the curve put in the scene, and how to change it. */
export interface Built {
  objects: Object3D[];
  materials: Material[];
  geometries: BufferGeometry[];
  /** Reveal the first `u` (0–1, by sample index) of the trace copy. */
  reveal(u: number): void;
  lineMaterials: LineMaterial[];
  baseWidths: number[];
  /** Replace the drawn shape with another curve, keeping materials. */
  reshape(curve: Curve): void;
}

export interface BuildInputs {
  curve: Curve;
  settings: ViewSettings;
  lineWidth: number;
  lineOpacity: number;
  envMap: Texture;
}

/** The full curve and its trace copy for the settings' style. */
export function buildCurve(inputs: BuildInputs): { full: Object3D; trace: Object3D; built: Built } {
  const s = inputs.settings;
  return s.style === 'neon' || s.style === 'ink' ? buildLines(inputs) : buildMesh(inputs);
}

function buildLines({ curve, settings: s, lineWidth, lineOpacity }: BuildInputs) {
  const bothOn = s.layers.curve && s.layers.trace;
  let segs = lineSegments(curve, s.palette);
  let segments = curve.count - 1;
  const fullGeom = new LineSegmentsGeometry();
  const traceGeom = new LineSegmentsGeometry();
  const fill = () => {
    for (const g of [fullGeom, traceGeom]) {
      g.setPositions(segs.positions);
      g.setColors(segs.colors);
    }
  };
  fill();
  const makeMat = (opacity: number) =>
    flatEndedLineMaterial({
      vertexColors: true,
      linewidth: lineWidth,
      transparent: true,
      opacity,
      depthWrite: s.style === 'ink',
      blending: s.style === 'neon' ? AdditiveBlending : NormalBlending,
      fog: s.style === 'ink',
    });
  const fullMat = makeMat(bothOn ? lineOpacity * DIM_OPACITY * 2 : lineOpacity);
  const traceMat = makeMat(lineOpacity);
  const full = new LineSegments2(fullGeom, fullMat);
  const trace = new LineSegments2(traceGeom, traceMat);
  let revealed = 0;
  const built: Built = {
    objects: [full, trace],
    materials: [fullMat, traceMat],
    geometries: [fullGeom, traceGeom],
    lineMaterials: [fullMat, traceMat],
    baseWidths: [lineWidth, lineWidth],
    reveal: (u) => {
      revealed = u;
      traceGeom.instanceCount = countBelow(segs.order, Math.floor(u * segments));
    },
    reshape: (next) => {
      segs = lineSegments(next, s.palette);
      segments = next.count - 1;
      fill();
      built.reveal(revealed);
    },
  };
  return { full, trace, built };
}

function lineSegments(curve: Curve, palette: string) {
  const colors = gradientColors(curve.count, paletteStops(palette));
  return gapSegments(curve.positions, colors, curve.count);
}

function sweep(curve: Curve, s: ViewSettings): SweptGeometry {
  const solid = dropGaps(curve.positions, curve.count);
  const dec = decimate(solid.positions, solid.count, MAX_MESH_POINTS);
  const colors = gradientColors(dec.count, paletteStops(s.palette));
  const size = Math.max(curve.radius, 1e-3);
  return s.style === 'tube'
    ? buildTube(dec.positions, dec.count, colors, s.tubeRadius * size, dec.count > 12000 ? 6 : 8)
    : buildRibbon(dec.positions, dec.count, colors, s.ribbonWidth * size, s.ribbonTwist);
}

/** A second geometry sharing the swept one's buffers, so the trace can draw a
 *  different range of the same mesh. */
function sharing(swept: SweptGeometry): BufferGeometry {
  const g = new BufferGeometry();
  for (const name of ['position', 'normal', 'color'] as const) g.setAttribute(name, swept.geometry.getAttribute(name));
  g.setIndex(swept.geometry.getIndex());
  g.boundingSphere = swept.geometry.boundingSphere;
  return g;
}

function buildMesh({ curve, settings: s, envMap }: BuildInputs) {
  const bothOn = s.layers.curve && s.layers.trace;
  let swept = sweep(curve, s);
  let traceGeom = sharing(swept);
  const makeMat = () =>
    s.style === 'tube'
      ? new MeshPhysicalMaterial({ vertexColors: true, metalness: 0.95, roughness: 0.26, clearcoat: 0.3, envMap })
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
    fullMat.opacity = DIM_OPACITY;
    fullMat.depthWrite = false;
  }
  const traceMat = makeMat();
  const full = new Mesh(swept.geometry, fullMat);
  const trace = new Mesh(traceGeom, traceMat);
  let revealed = 0;
  const built: Built = {
    objects: [full, trace],
    materials: [fullMat, traceMat],
    geometries: [swept.geometry, traceGeom],
    lineMaterials: [],
    baseWidths: [],
    reveal: (u) => {
      revealed = u;
      traceGeom.setDrawRange(0, swept.indicesUpTo(u * swept.segments));
    },
    reshape: (next) => {
      swept.geometry.dispose();
      traceGeom.dispose();
      swept = sweep(next, s);
      traceGeom = sharing(swept);
      full.geometry = swept.geometry;
      trace.geometry = traceGeom;
      built.geometries = [swept.geometry, traceGeom];
      built.reveal(revealed);
    },
  };
  return { full, trace, built };
}

/** How many of the ascending `order` are below `n`. */
function countBelow(order: Uint32Array, n: number): number {
  let lo = 0;
  let hi = order.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (order[mid] < n) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Additive lines brighten with every overlap. Curves up to ~90 radii long
 *  look right at the set opacity; longer ones are dimmed toward it. */
export function neonExposure(curve: Curve): number {
  const density = curve.length / Math.max(curve.radius, 1e-6);
  return Math.min(1, (90 / density) ** 0.7);
}
