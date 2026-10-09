# agnew

Spirograph-style line art in 3D. A curve is built from a stack of simple
motions (rotating arms, pendulums, torus windings), optionally wrapped onto a
sphere or torus, decayed or precessed, and drawn with three.js as glowing
lines, lit metal tubes, ink on paper or iridescent ribbons.

**Live:** [michaelbaker.tech/agnew](https://michaelbaker.tech/agnew/) — the lab,
deployed from `main` by `.github/workflows/pages.yml`.

**Status: prototype.** Everything below works and is covered by the tests and
the smoke script; nothing is published to npm yet.

## Layout

- `packages/agnew` — the library, to be published as `agnew`. `agnew` is the
  pure curve model (no DOM, no three.js); `agnew/three` is the renderer.
- `apps/lab` — the lab app (Vite + React, one labkit `<Lab>` instrument), built
  only on the library's public API.
- `docs/superpowers/specs/2026-09-22-agnew-design.md` — the design and the
  decisions behind it.

## Run it

```bash
npm install
npm run dev          # lab on http://localhost:5190
npm test             # unit tests: the library and the lab
npm run smoke        # drives the running lab headless (Chrome) end to end
npm run shots        # screenshots of every preset and style into shots/
```

`python3 scripts/sheet.py out.png 5 shots/*.png` tiles screenshots into one
contact sheet.

## The model

A design is plain data: `{ version, turns, samples, loop, passes, blocks }`. Time runs over
`turns` full cycles; the pen starts at the origin and each enabled block maps
it in order. **Sources** add a motion; **modifiers** transform everything so
far.

| Block | Role | What it does |
| --- | --- | --- |
| Epicycle arm | source | An arm of fixed radius spinning at a frequency, in a tilted plane |
| Pendulum | source | A damped sine along one axis |
| Torus winding | source | Winds `p` times around a torus and `q` times through it |
| Wrap onto sphere | modifier | Flat x/y become position on a sphere; z becomes height |
| Wrap onto torus | modifier | x/y become angles around/through a torus, with optional drift |
| Decay | modifier | Shrinks toward the origin over time |
| Precess | modifier | Slowly rotates the whole figure about an axis |
| Scale | modifier | Per-axis scale |

Each block kind describes its parameters as plain data (`ParamSpec`), so any UI
can build controls for it; the lab maps them to labkit panels.

### Moving designs

Any number param can move over the design's **loop** (seconds): a **wave**
(sine, triangle, saw, or square, swinging `±depth` around the set value, a whole
number of cycles per loop) or **keys** (values at points through the loop,
eased between). A design can also **morph** toward a second block stack, blending
the two curves point by point, and the morph's weight can move too. Every motion
repeats exactly once per loop, so a recording of one loop repeats seamlessly.

```ts
block.motion = { radius: { kind: 'wave', shape: 'sine', cycles: 2, depth: 0.2, phase: 0 } };
animate(design).at(3.5); // the design fixed 3.5 s in: plain values, no motions
```

`animate` runs one [blits](https://github.com/orochi235/blits) mix over the
moving values, a looping voice per motion.

```ts
import { createBlock, evaluate } from 'agnew';
import { createAgnewView } from 'agnew/three';

const design = {
  version: 2,
  loop: 12,
  passes: 1,
  turns: 12,
  samples: 36000,
  blocks: [
    createBlock('arm', { radius: 0.3, freq: 1 }),
    createBlock('arm', { radius: 0.16, freq: -6.02 }),
    createBlock('wrapTorus', { uDrift: 1 / 12 }),
  ],
};

evaluate(design); // { positions: Float32Array, count, radius, length }
const view = createAgnewView(canvas, { design, settings: { style: 'tube' } });
```

## The view

`createAgnewView(canvas)` owns the renderer, camera and orbit controls. Three
layers switch on independently: **curve** (the whole thing), **trace** (a pen
redrawing it from the start, `passes` times per loop at an even speed along the
line; with the curve also on, the curve dims to a ghost), and **mechanism** (the arms at the pen's current time, and the
wireframe of any surface it is wrapped onto). `exportPNG(scale)` renders at a
multiple of screen resolution; `record(seconds)` returns a WebM.

`view.setFraming({width, height})` composes for a box smaller than the canvas,
so the canvas can run under a translucent panel while the picture stays where
it is; exports and recordings cover the framed box only.

The view runs one clock over the design's loop. `view.playing = false` freezes
the pen, any motion, the mechanism and auto-rotation on the current frame, and
`view.progress` (0–1 of the loop) reads or moves the clock.

Neon and ink lines are evaluated on the GPU: every block kind has a GLSL copy
(`three/glsl.ts`), its number params are uniforms, and a moving curve only
updates them. Tubes and ribbons rebuild on the CPU each frame. Measured
headless on an M2 Max (Chrome, Metal) with a wave on the Harmonograph preset's
50,000 points: GPU neon 60 fps, CPU neon 47, tube 33. `settings.gpu = false`
draws lines on the CPU too; the smoke run compares the two for every preset.
The lab puts both in a bar over the canvas (Space toggles play), and grabbing
the view turns auto-rotate off so a chosen angle stays put.

`?bare` opens the lab presenting: the picture alone, for embedding. labkit's own
`?present` does the same, and the lab's **Present** button presents in place
until Escape.

The lab saves presets (design plus look) by name in the browser, where they
join the preset dropdown, or as `.agnew.json` files to keep or share.
`presets/` holds files worth keeping; open one with **Load file**.

In the neon style, lines add light where they cross, so the view dims a curve
that is long relative to its size.

## Not built yet

- `wave` motions are built from a blits `patch` in `animate.ts` until blits
  releases its own `wave` patch (blits branch `wave`); then `animate.ts` should
  take it from there.

- Tube and ribbon meshes rebuild on the main thread. The heaviest preset takes
  about 40 ms per rebuild, so slider drags on it run at roughly 25 fps. A Web
  Worker would fix that.
- No undo; the URL hash holds the whole state, so a link is a snapshot.
- No node-graph editor. The stack is stored so that a `@weasel-js/diagram`
  view could be added over the same data.
