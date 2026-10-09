import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  NormalBlending,
  Points,
  PointsMaterial,
  Sprite,
  SpriteMaterial,
  type Texture,
} from 'three';
import type { Mechanism } from '../design.js';

const MAX_JOINTS = 64;

/** The pen, and the mechanism drawing it: arms as a line through the joints,
 *  dots at the joints, and a wireframe of any wrap surface. */
export interface MechanismView {
  /** Arms, dots and guides; shown with the mechanism layer. */
  group: Group;
  pen: Sprite;
  /** Place the pen and, when `withArms`, the arms for one moment. */
  update(m: Mechanism, size: number, penVisible: boolean, withArms: boolean): void;
  /** Dark marks on a light background, light ones on a dark one. */
  setLight(light: boolean): void;
  setDotScale(pixelRatio: number): void;
  dispose(): void;
}

export function createMechanism(): MechanismView {
  const group = new Group();
  const glow = glowTexture();
  const pen = new Sprite(new SpriteMaterial({ map: glow, depthWrite: false, blending: AdditiveBlending }));
  const armGeom = new BufferGeometry();
  armGeom.setAttribute('position', new BufferAttribute(new Float32Array(MAX_JOINTS * 3), 3));
  const armMat = new LineBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false });
  const arms = new Line(armGeom, armMat);
  const dotMat = new PointsMaterial({ size: 6, sizeAttenuation: false, transparent: true, depthWrite: false });
  const dots = new Points(armGeom, dotMat);
  const guideMat = new LineBasicMaterial({ transparent: true, opacity: 0.12, depthWrite: false });
  const guides = new LineSegments(new BufferGeometry(), guideMat);
  group.add(guides, arms, dots);
  for (const o of [arms, dots, guides]) o.frustumCulled = false;

  return {
    group,
    pen,
    update(m, size, penVisible, withArms) {
      pen.position.set(m.point[0], m.point[1], m.point[2]);
      pen.scale.setScalar(size * 0.09);
      pen.visible = penVisible && Number.isFinite(m.point[0] + m.point[1] + m.point[2]);
      if (!withArms) return;
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
    },
    setLight(light) {
      const mark = new Color(light ? '#1b1a2e' : '#ffffff');
      armMat.color = mark;
      dotMat.color = mark;
      guideMat.color = mark;
      guideMat.opacity = light ? 0.18 : 0.12;
      const penMat = pen.material as SpriteMaterial;
      penMat.blending = light ? NormalBlending : AdditiveBlending;
      penMat.color = mark.clone();
    },
    setDotScale(pixelRatio) {
      dotMat.size = 6 * pixelRatio;
    },
    dispose() {
      glow.dispose();
      armGeom.dispose();
      guides.geometry.dispose();
      for (const m of [armMat, dotMat, guideMat, pen.material]) m.dispose();
    },
  };
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
