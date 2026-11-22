import { f, resolveConfigSchema } from '@weasel-js/labkit';
import { AUTO_ROTATE_LABELS, AUTO_ROTATES, COLOR_FILTERS, FIT_MODES, PALETTES, SHAPE_NAMES, SHAPES, STYLES, type Style } from 'agnew/three';

const isStyle = (...styles: Style[]) => (c: Record<string, unknown>) => styles.includes(c.style as Style);

export const viewSchema = resolveConfigSchema(
  f.schema({
    style: f.enum('neon', [...STYLES]).label('Style'),
    palette: f.enum('aurora', Object.keys(PALETTES)).label('Palette'),
    background: f.color('#05060a').label('Background'),
    bloom: f.number(0.9).range(0, 3).step(0.05).label('Bloom').auto(),
    lineWidth: f.number(1.6).range(0.5, 6).step(0.1).label('Line width').suffix('px').auto().showIf(isStyle('neon', 'ink')),
    lineOpacity: f.number(0.55).range(0.02, 1).step(0.01).label('Line opacity').auto().showIf(isStyle('neon', 'ink')),
    tubeRadius: f.number(0.012).range(0.002, 0.06).step(0.001).label('Tube radius').showIf(isStyle('tube')),
    ribbonWidth: f.number(0.035).range(0.005, 0.15).step(0.001).label('Ribbon width').showIf(isStyle('ribbon')),
    ribbonTwist: f.number(40).range(0, 400).step(1).label('Ribbon twists').showIf(isStyle('ribbon')),
    hue: f.number(0).range(-180, 180).step(1).label('Hue').suffix('°'),
    filter: f.enum('none', [...COLOR_FILTERS]).label('Filter'),
    autoRotate: f
      .enum(
        'orbit',
        AUTO_ROTATES.map((value) => ({ value, label: AUTO_ROTATE_LABELS[value] })),
      )
      .label('Auto-rotate')
      .describe('Orbit swings the camera around the vertical; spin and tumble turn the curve itself; fling keeps it turning the way you throw it with a drag.'),
    fit: f
      .enum('orbit', [...FIT_MODES])
      .label('Fit')
      .describe('Orbit keeps the whole curve in view from any angle; tight fills the frame from this one.'),
    shape: f
      .enum(
        'free',
        SHAPE_NAMES.map((value) => ({ value, label: SHAPES[value].label })),
      )
      .label('Shape')
      .describe('Frame the picture as a rect of this shape, for a banner or a sidebar. Picking one zooms in and turns to the angle that fills it most.'),
    ratioW: f
      .number(30)
      .range(1, 200)
      .step(1)
      .input()
      .label('Width')
      .describe('The frame is Width : Height. Typing one switches the shape to Custom.')
      .showIf((c) => c.shape !== 'free'),
    ratioH: f
      .number(1)
      .range(1, 200)
      .step(1)
      .input()
      .label('Height')
      .showIf((c) => c.shape !== 'free'),
    stretch: f
      .boolean(false)
      .label('Stretch to shape')
      .describe("Scale the curve toward the shape's proportions so it fills the rect.")
      .showIf((c) => c.shape !== 'free'),
    azimuth: f
      .number(19)
      .range(-180, 180)
      .step(0.5)
      .label('Azimuth')
      .suffix('°')
      .describe('Camera direction around the vertical. 0 looks straight down the z axis.')
      .auto(),
    elevation: f
      .number(15)
      .range(-89, 89)
      .step(0.5)
      .label('Elevation')
      .suffix('°')
      .describe('Camera height above the horizon. Azimuth 0 and any elevation keeps the x axis level.')
      .auto(),
    layers: f.group({
      curve: f.boolean(true).label('Curve'),
      trace: f.boolean(false).label('Trace'),
      mechanism: f.boolean(false).label('Mechanism'),
    }),
    gpu: f
      .boolean(true)
      .label('GPU lines')
      .describe('Draw neon and ink lines on the GPU, so a moving curve redraws without rebuilding.'),
  }),
);
