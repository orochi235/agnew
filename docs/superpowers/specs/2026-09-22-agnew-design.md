# agnew — design

Composable 3D spirograph line art: a TypeScript library that turns a stack of
simple motions into a 3D curve and draws it with three.js, plus a lab app for
tuning curves and exporting them. This doc is for whoever picks the project up
next; it records the decisions made while brainstorming (2026-09-21) that the
code alone would not tell you. **Status:** prototype built 2026-09-22; the
items under "Not in the prototype" are unbuilt.

## Decisions

- **Library + app.** `packages/agnew` is publishable on npm as `agnew` (name
  free as of 2026-09-21). `apps/lab` is built only on its public API.
- **Curves are computed on the CPU.** Blocks are pure functions; the evaluator
  fills a `Float32Array`. A GLSL backend can be added later without changing
  the model. Chosen over GPU evaluation to get to pretty pictures sooner and
  keep everything unit-testable.
- **Composable blocks, stored as plain data.** A design is an ordered list of
  blocks. The list is a degenerate graph on purpose: a node-graph editor on
  `@weasel-js/diagram` is a plausible later view of the same data.
- **Pretty over fabricable.** No plotter/SVG hidden-line output.
- **UI on weasel.** The lab uses `@weasel-js/labkit` (`LabShell`,
  `ControlPanel`, `f` schemas).

## Model

A **design** is `{ version, blocks, sampling }`. Each **block** is
`{ id, kind, enabled, params }`. A block kind declares its parameters as plain
`ParamSpec` data (key, label, default, range, step, or options) — the app maps
these to labkit controls, so the library never depends on labkit.

Evaluation runs time `t` over `[0, turns·2π]`. The pen starts at the origin and
each enabled block, in order, maps the running point:

- **Sources add** a motion: epicycle arm (a rotating arm in a tilted plane),
  pendulum (damped oscillation along an axis), torus knot (a p/q winding).
- **Modifiers transform** the point so far: wrap onto sphere, wrap onto torus
  (treating the flat pattern as surface coordinates), decay (shrink over time),
  precess (slow rotation of the whole figure), scale.

The four families from brainstorming ship as **presets**, plus combinations
(harmonograph on a torus, precessing epicycles, and so on).

`evaluateAt(design, t)` also returns the running point after each block — the
**joints** — which is what the mechanism overlay draws.

## Rendering

`createAgnewView(canvas)` owns a three.js renderer, camera and orbit controls.
Styles: **neon** (fat additive lines + bloom) and **tube** (lit metal wire) are
the flagship looks; **ink** (dark lines on paper, depth fog) and **ribbon**
(twisting iridescent band) are extra modes. Color runs along the curve as a
gradient.

Three independent, composable layers:

- **curve** — the whole curve, rebuilt live as parameters change;
- **trace** — replays the curve from nothing with a glowing pen tip;
- **mechanism** — faint arms and joints at the pen's current time, plus the
  guide surface when a wrap modifier is present.

Export: PNG at a multiple of screen resolution, and WebM video via
`MediaRecorder` over the canvas stream.

## Lab app

A viewport and a sidebar: preset picker, global settings (style, layers,
sampling, colors), a stack editor (one card per block with its own
`ControlPanel`; add, remove, reorder, enable), and export buttons. The whole
design and view settings live in the URL hash, so any state is a shareable
link.

## Not in the prototype

- Tube/ribbon meshes rebuild on the main thread (coalesced per frame) rather
  than in a Web Worker.
- No undo; the URL hash and browser history stand in for it.
- No node-graph editor.
