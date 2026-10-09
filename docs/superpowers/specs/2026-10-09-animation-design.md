# agnew — animation, morphs, and the GPU line evaluator

**For:** whoever works on agnew next. **Answers:** how a design moves over time, how the blits mix
fits in, and what runs on the GPU. **Status:** being built on branch `animate` (2026-10-09); this
doc is folded into the main design doc and deleted once it lands.

## Decisions (from brainstorming, 2026-10-09)

- **Animation is part of the design.** It is stored with the blocks, so a share link opens moving
  and a WebM records it. The library depends on `@msb235/blits`.
- **Two kinds of motion: `wave` and `keys`.** A wave is stored as a wave (shape, cycles, depth,
  phase), not approximated by keyframes. blits gains a `wave` data patch beside `keys`.
- **One clock.** The transport is time in seconds; the pen, the animation, scrubbing, and export
  all read it.
- **One loop length per design.** Waves run whole cycles per loop and `keys` span it, so every
  animation repeats seamlessly and export records exactly one loop.
- **Tubes and ribbons rebuild on the CPU each frame** while animating; neon and ink evaluate on
  the GPU.
- **Everything ships together:** motions, morphs, and the GLSL evaluator.

## Model

```ts
interface Block { id; kind; enabled; params; motion?: Record<string, Motion> }  // number params only

type Motion =
  | { kind: 'wave'; shape: 'sine' | 'triangle' | 'saw' | 'square'; cycles: number; depth: number; phase: number }
  | { kind: 'keys'; stops: { at: number; value: number }[]; ease?: Easing };

interface Design {
  version: 2;
  blocks; turns; samples;
  loop: number;     // seconds
  passes: number;   // pen passes per loop
  morph?: { to: { blocks: Block[]; turns: number }; weight: number; motion?: Motion };
}
```

A wave swings `±depth` around the slider's value; `keys` replaces it, with `at` as a fraction of
the loop. A morph blends this design's curve toward `to` point by point at the same fraction
along each, by `weight` (0..1, clamped), which may itself move. Motions live on the block rather
than referring to it, because block ids are regenerated on every load. A version 1 design loads
with no motion, `loop: 12`, and `passes: 1`.

## How it runs

| Step | Where | What |
|---|---|---|
| Resolve time | `animate.ts` | One blits mix per design over a kit of `sum()` channels, one per moving value (`b3.radius`, `morph`), one voice per motion, each looping over the loop. `at(seconds)` syncs the mix and returns a static design: every value fixed for that moment, motions gone. The mix's clock only runs forward, so a scrub back is taken as a wrap forward to the same point in the loop |
| Curve on the CPU | `design.ts` | `evaluate` of a static design, unchanged except that it blends a morph |
| Curve on the GPU | `three/glsl.ts` | Builds the line material's vertex shader for one design structure: block kinds and choice parameters fixed in the source, numeric parameters and the morph weight as uniforms. Each segment carries its two `u` values (fraction along the curve) in place of positions. A non-finite point collapses its segment, which is how a gap shows |
| Pen, trace, framing | `three/view.ts` | Read a coarse CPU curve each animated frame (arc length for the pen, bounds). Camera angle and the automatic look are worked out on a full rebuild only, so the camera does not chase the animation |

The pen's position is `frac(seconds × passes / loop)` of the way along the curve by distance.
`traceSpeed` and the end-of-pass hold are retired.

## Lab

Every number control in the block stack gets an animate toggle that opens the motion's fields.
The curve panel gets loop length and passes. The preset panel gets "morph to", which picks a
preset or saved design as the target, plus a weight with its own animate toggle.

## Checks

- Unit: blits `wave`; the motion codec; `animate` at known times, wrapping, and scrubbing back;
  morph evaluation; GLSL source for every block kind compiles in the smoke run.
- Parity: the smoke script renders every preset in neon with the GPU evaluator on and off, and
  fails on a pixel difference above a small threshold.

## Build order

1. Split `view.ts` (996 lines) along clock, build, mechanism, and export.
2. Model: `motion.ts`, design v2, codec.
3. `animate.ts` on blits, with the wave patch built locally until blits releases `wave`.
4. Morph evaluation.
5. View clock and per-frame CPU rebuild.
6. GLSL evaluator for neon and ink; parity smoke.
7. Lab UI.
