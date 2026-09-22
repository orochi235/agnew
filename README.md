# agnew

Spirograph-style line art in 3D. A curve is built from a stack of simple
motions (rotating arms, pendulums, torus windings), optionally wrapped onto a
sphere or torus, decayed or precessed, and drawn with three.js as glowing
lines, lit metal tubes, ink on paper or iridescent ribbons.

**Status: prototype.** Everything below works and is covered by the tests and
the smoke script; nothing is published to npm yet.

## Layout

- `packages/agnew` — the library, to be published as `agnew`. `agnew` is the
  pure curve model (no DOM, no three.js); `agnew/three` is the renderer.
- `apps/lab` — the lab app (Vite + React on `@weasel-js/labkit`), built only on
  the library's public API.
- `docs/superpowers/specs/2026-09-22-agnew-design.md` — the design and the
  decisions behind it.

## Run it

```bash
npm install
npm run dev          # lab on http://localhost:5190
npm test             # library unit tests
npm run smoke        # drives the running lab headless (Chrome) end to end
npm run shots        # screenshots of every preset and style into shots/
```

`python3 scripts/sheet.py out.png 5 shots/*.png` tiles screenshots into one
contact sheet.

## The model

A design is plain data: `{ version, turns, samples, blocks }`. Time runs over
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

```ts
import { createBlock, evaluate } from 'agnew';
import { createAgnewView } from 'agnew/three';

const design = {
  version: 1,
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
redrawing it from the start at a steady speed along the line, set in curve
radii per second, so a longer curve takes longer; with the curve also on, the
curve dims to a ghost), and **mechanism** (the arms at the pen's current time, and the
wireframe of any surface it is wrapped onto). `exportPNG(scale)` renders at a
multiple of screen resolution; `record(seconds)` returns a WebM.

The lab saves presets (design plus look) by name in the browser, where they
join the preset dropdown, or as `.agnew.json` files to keep or share.

In the neon style, lines add light where they cross, so the view dims a curve
that is long relative to its size.

## Not built yet

- Tube and ribbon meshes rebuild on the main thread. The heaviest preset takes
  about 40 ms per rebuild, so slider drags on it run at roughly 25 fps. A Web
  Worker would fix that.
- No undo; the URL hash holds the whole state, so a link is a snapshot.
- No node-graph editor. The stack is stored so that a `@weasel-js/diagram`
  view could be added over the same data.
