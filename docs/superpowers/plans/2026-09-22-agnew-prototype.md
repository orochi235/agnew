# agnew prototype — implementation plan

> **Done** — executed inline in the session that wrote it (overnight build,
> 2026-09-22). Kept as a record of the file layout; the code is the detail.

**Goal:** a working lab that composes 3D spirograph curves from blocks and
renders them in four styles with curve / trace / mechanism layers and PNG +
video export. Spec: `docs/superpowers/specs/2026-09-22-agnew-design.md`.

**Architecture:** pure-TS evaluator (`packages/agnew/src`) → `Float32Array`;
three.js view (`packages/agnew/src/three`) builds line/tube/ribbon geometry
from it; React lab (`apps/lab`) on labkit edits a serializable design held in
the URL hash.

**Tech stack:** TypeScript, three.js, Vitest, Vite, React 19, `@weasel-js/labkit`.

## Files

`packages/agnew/src/`
- `vec.ts` — `Vec3` tuple helpers and rotations.
- `params.ts` — `ParamSpec` (plain-data parameter descriptors) and defaults.
- `blocks.ts` — block kinds: `arm`, `pendulum`, `torusKnot`, `wrapSphere`,
  `wrapTorus`, `decay`, `precess`, `scale`; registry.
- `design.ts` — `Design`/`Block` types, `createBlock`, `evaluate`,
  `evaluateAt` (point + joints), bounds.
- `presets.ts` — named designs.
- `codec.ts` — design + view settings ⇄ URL-safe string.
- `frames.ts` — parallel-transport frames along a polyline.
- `index.ts` — public barrel.

`packages/agnew/src/three/`
- `geometry.ts` — line positions/colors, tube mesh, ribbon mesh (pure, testable).
- `palette.ts` — gradient color along the curve.
- `view.ts` — `createAgnewView`: renderer, camera, controls, styles, layers,
  trace clock, bloom, export.
- `index.ts` — barrel.

`apps/lab/src/`
- `main.tsx`, `App.tsx` — shell, viewport, sidebar.
- `schema.ts` — `ParamSpec` → labkit `f` nodes.
- `StackEditor.tsx` — block cards: add/remove/move/enable + per-block panel.
- `state.ts` — lab state + URL hash sync.

## Tasks

1. Core math: `vec`, `params`, `blocks`, `design` + tests (torus knot closes,
   sphere wrap radius, pendulum decay, joints end at the point).
2. Presets + codec + tests (every preset finite with non-zero extent; codec
   round-trips).
3. `frames` + `three/geometry` + tests (frames orthonormal; tube/ribbon vertex
   counts and draw ranges).
4. `three/view`: styles, layers, trace, bloom, export.
5. Lab app: shell, settings panel, stack editor, presets, hash state, export.
6. Browser verification (headless screenshots of each style and preset), fix
   what looks wrong, commit.
7. README with status + PROJECTS.md entry.
