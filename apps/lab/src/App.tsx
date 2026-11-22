import { Lab } from '@weasel-js/labkit';
import { agnewInstrument } from './instrument';
import { startsPresenting } from './present';

const INSTRUMENTS = [agnewInstrument];

/** One trial, so the trial operations for many have nothing to act on; the
 *  hash, not labkit, is what holds a state worth going back to. */
const SUPPRESS = ['clone', 'close', 'reset', 'snapshot'];

export function App() {
  return (
    <Lab
      instruments={INSTRUMENTS}
      title="agnewgraph (rip ted)"
      mode="dark"
      present={startsPresenting(location.search)}
      transport={false}
      addTrial={false}
      zoom={false}
      suppress={SUPPRESS}
    />
  );
}
