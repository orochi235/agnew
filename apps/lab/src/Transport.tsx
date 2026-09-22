import type { AgnewView } from 'agnew/three';
import { type RefObject, useEffect, useRef } from 'react';

interface Props {
  view: RefObject<AgnewView | null>;
  playing: boolean;
  onPlayingChange(playing: boolean): void;
  /** Show the scrubber; it only means something while the pen is drawn. */
  scrubbable: boolean;
}

/** Play/pause and a scrubber over the pen's position along the curve. */
export function Transport({ view, playing, onPlayingChange, scrubbable }: Props) {
  const scrubRef = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);

  // Follow the pen without re-rendering React every frame.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const v = view.current;
      if (v && scrubRef.current && !dragging.current) scrubRef.current.value = String(v.progress);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [view]);

  return (
    <div className={scrubbable ? 'ag-transport ag-transport--wide' : 'ag-transport'}>
      <button
        type="button"
        className="ag-transport__play"
        onClick={() => onPlayingChange(!playing)}
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      {scrubbable && (
        <input
          ref={scrubRef}
          className="ag-transport__scrub"
          type="range"
          min={0}
          max={1}
          step={0.0001}
          defaultValue={0}
          aria-label="Pen position"
          onPointerDown={() => {
            dragging.current = true;
            onPlayingChange(false);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onInput={(e) => {
            if (view.current) view.current.progress = Number(e.currentTarget.value);
            if (playing) onPlayingChange(false);
          }}
        />
      )}
    </div>
  );
}
