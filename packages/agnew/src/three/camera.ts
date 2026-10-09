import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Curve } from '../design.js';
import type { Vec3 } from '../vec.js';
import { angleOf, directionFor, type FitMode, fovFor, halfTangents, orbitDistance, tightFraming } from './framing.js';
import { type AutoRotate, type DragSample, type Fling, flingFrom, turnsCurve } from './rotation.js';

/** The camera and the orbit controls that drive it. */
export interface CameraRig {
  camera: PerspectiveCamera;
  /** The turn the last drag threw, for `fling`. */
  thrown: Fling | null;
  /** Paused and not yet touched: the camera holds still instead of coasting
   *  on damping, so pausing lands on the angle it was at. */
  held: boolean;
  /** Turn to an angle around the target, keeping distance. */
  aim(angle: { azimuth: number; elevation: number }): void;
  /** Move so the whole curve is in view, keeping direction. */
  fit(curve: Pick<Curve, 'positions' | 'count' | 'radius'> | null, mode: FitMode, autoRotate: AutoRotate): void;
  /** Fly camera and target together, in camera space, in units of `size`. */
  fly(right: number, up: number, forward: number, size: number): void;
  /** Orbit on its own while `orbiting`; damp unless a fling owns the motion. */
  setMotion(orbiting: boolean, autoRotate: AutoRotate): void;
  update(dt: number): void;
  dispose(): void;
}

export function createCameraRig(
  canvas: HTMLCanvasElement,
  start: { azimuth: number; elevation: number },
  hooks: { onUserOrbit?: () => void; onCameraAngle?: (angle: { azimuth: number; elevation: number }) => void },
): CameraRig {
  const camera = new PerspectiveCamera(fovFor(1), 1, 0.01, 100);
  camera.position.set(...directionFor(start.azimuth, start.elevation)).multiplyScalar(3.5);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.autoRotateSpeed = 0.6;
  let drag: DragSample[] | null = null;
  const cameraDir = (): Vec3 => camera.position.clone().sub(controls.target).normalize().toArray();

  const rig: CameraRig = {
    camera,
    thrown: null,
    held: false,
    aim(a) {
      const dist = camera.position.distanceTo(controls.target);
      const d = directionFor(a.azimuth, a.elevation);
      camera.position.copy(controls.target).add(new Vector3(...d).multiplyScalar(dist));
      camera.lookAt(controls.target);
    },
    fit(c, mode, autoRotate) {
      const [ty, tx] = halfTangents(camera.fov, camera.aspect);
      let dist = orbitDistance(Math.max(c?.radius ?? 1, 0.05), ty, tx);
      const target = new Vector3();
      const back = camera.position.clone().sub(controls.target).normalize();
      // A turning curve sweeps past any one angle's silhouette, so it gets the orbit sphere.
      if (mode === 'tight' && !turnsCurve(autoRotate) && c) {
        const right = new Vector3(0, 1, 0).cross(back).normalize();
        const up = back.clone().cross(right);
        const basis = { right: right.toArray(), up: up.toArray(), back: back.toArray() };
        const f = tightFraming(c.positions, c.count, basis, ty, tx);
        dist = Math.max(f.distance, 0.05);
        target.addScaledVector(right, f.pan[0]).addScaledVector(up, f.pan[1]);
      }
      camera.position.copy(target).addScaledVector(back, dist);
      camera.near = dist / 100;
      camera.far = dist * 10;
      camera.updateProjectionMatrix();
      controls.target.copy(target);
    },
    fly(right, up, forward, size) {
      const back = camera.position.clone().sub(controls.target).normalize();
      const r = new Vector3(0, 1, 0).cross(back).normalize();
      const u = back.clone().cross(r);
      const step = r.multiplyScalar(right * size).add(u.multiplyScalar(up * size));
      camera.position.add(step);
      controls.target.add(step);
      const dist = camera.position.distanceTo(controls.target);
      const ahead = Math.min(forward * size, dist - size * 0.05);
      camera.position.addScaledVector(back, -ahead);
      camera.near = Math.max(1e-3, (dist - ahead) / 100);
      camera.far = (dist - ahead) * 10 + size * 4;
      camera.updateProjectionMatrix();
      rig.held = false;
    },
    setMotion(orbiting, autoRotate) {
      controls.autoRotate = autoRotate === 'orbit' && orbiting;
      // A fling hands the drag's motion to the curve; the camera coasting on as well would turn it twice.
      controls.enableDamping = autoRotate !== 'fling';
    },
    update(dt) {
      if (!rig.held) controls.update(dt);
    },
    dispose() {
      controls.dispose();
    },
  };

  controls.addEventListener('start', () => {
    rig.held = false;
    drag = [{ t: performance.now(), dir: cameraDir() }];
    hooks.onUserOrbit?.();
  });
  controls.addEventListener('change', () => {
    if (!drag) return;
    const dir = cameraDir();
    // Turning the camera catches a fling; a zoom or pan leaves it going.
    if (dir.some((v, i) => Math.abs(v - drag![0].dir[i]) > 1e-6)) rig.thrown = null;
    drag.push({ t: performance.now(), dir });
    if (drag.length > 32) drag.splice(1, 1);
  });
  controls.addEventListener('end', () => {
    if (drag && rig.thrown === null) rig.thrown = flingFrom(drag, performance.now());
    drag = null;
    const d = camera.position.clone().sub(controls.target);
    const a = angleOf([d.x, d.y, d.z]);
    const round = (x: number) => Math.round(x * 10) / 10;
    hooks.onCameraAngle?.({ azimuth: round(a.azimuth), elevation: round(a.elevation) });
  });
  return rig;
}
