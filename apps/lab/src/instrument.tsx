import { defineInstrument } from '@weasel-js/labkit';
import { CurvePanel } from './panels/CurvePanel';
import { ExportPanel } from './panels/ExportPanel';
import { LookPanel } from './panels/LookPanel';
import { PresetPanel } from './panels/PresetPanel';
import { Picture } from './Picture';
import type { AgnewState } from './session';
import { initialState } from './state';

/** One curve and its view. Its state opens on the URL hash, which the picture
 *  keeps up to date, so the lab persists nothing of its own. */
export const agnewInstrument = defineInstrument<AgnewState, Record<string, never>>({
  name: 'agnew',
  defaultConfig: () => ({}),
  initialState: () => ({ ...initialState(), playing: true }),
  render: () => <Picture />,
  chrome: [
    { id: 'agnew-preset', region: 'sidebar', item: { title: 'Preset', body: <PresetPanel /> } },
    { id: 'agnew-look', region: 'sidebar', item: { title: 'Look', body: <LookPanel /> } },
    { id: 'agnew-curve', region: 'sidebar', item: { title: 'Curve', body: <CurvePanel /> } },
    { id: 'agnew-export', region: 'sidebar', item: { title: 'Export', body: <ExportPanel /> } },
  ],
});
