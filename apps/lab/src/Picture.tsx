import { usePresentation } from '@weasel-js/labkit';
import { moves } from 'agnew';
import { createAgnewView, frameAspect, shapeBox } from 'agnew/three';
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { ArtLoupe } from './ArtLoupe';
import { useFlyKeys } from './flyKeys';
import { useAgnew, useAgnewView } from './session';
import { writeHash } from './state';
import { Transport } from './Transport';

/** Dims everything outside the frame's shape. Its geometry is live, so it
 *  arrives as custom properties rather than a class. */
function ShapeOutline({ box }: { box: { x: number; y: number; width: number; height: number } }) {
  const vars = { '--x': `${box.x}px`, '--y': `${box.y}px`, '--w': `${box.width}px`, '--h': `${box.height}px` };
  return <div className="ag-shape" style={vars as CSSProperties} />;
}

/** The trial's content: the view's canvas, with the frame outline, the custom
 *  badge and the play controls over it — or, presented, the canvas alone. */
export function Picture() {
  const { state, setState } = useAgnew();
  const viewRef = useAgnewView();
  const { active: presenting } = usePresentation();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const view = createAgnewView(canvasRef.current!, {
      design: state.design,
      settings: state.view,
      // A chosen angle should stay put.
      onUserOrbit: () =>
        setState((s) => (s.view.autoRotate === 'orbit' ? { ...s, view: { ...s.view, autoRotate: 'off' } } : s)),
      onCameraAngle: (angle) => setState((s) => ({ ...s, view: { ...s.view, ...angle } })),
    });
    view.playing = state.playing;
    viewRef.current = view;
    requestAnimationFrame(() => view.fit());
    // The view is created once; later changes flow through the effects below.
    return () => {
      view.dispose();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const box = rootRef.current;
    if (!box) return;
    const apply = () => setArea({ width: box.clientWidth, height: box.clientHeight });
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  useEffect(() => viewRef.current?.setDesign(state.design), [state.design]);
  useEffect(() => viewRef.current?.setSettings(state.view), [state.view]);
  useEffect(() => viewRef.current?.fit(), [state.view.fit]);
  useEffect(() => {
    if (viewRef.current) viewRef.current.playing = state.playing;
  }, [state.playing]);

  const setPlaying = useCallback((playing: boolean) => setState((s) => ({ ...s, playing })), [setState]);
  const stopRotating = useCallback(
    () => setState((s) => (s.view.autoRotate === 'orbit' ? { ...s, view: { ...s.view, autoRotate: 'off' } } : s)),
    [setState],
  );
  useFlyKeys(viewRef, stopRotating);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, button, [contenteditable]')) return;
      e.preventDefault();
      setState((s) => ({ ...s, playing: !s.playing }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setState]);
  useEffect(() => {
    const id = setTimeout(() => writeHash(state), 250);
    return () => clearTimeout(id);
  }, [state]);

  const aspect = frameAspect(state.view);
  return (
    <div className="ag-picture" ref={rootRef}>
      <canvas ref={canvasRef} className="ag-canvas" />
      {!presenting && (
        <>
          <div className="ag-viewport">
            {aspect && <ShapeOutline box={shapeBox({ x: 0, y: 0, ...area }, aspect)} />}
            {!state.preset && <div className="ag-badge">custom</div>}
            <Transport
              view={viewRef}
              playing={state.playing}
              onPlayingChange={setPlaying}
              scrubbable={state.view.layers.trace || state.view.layers.mechanism || moves(state.design)}
            />
          </div>
          <ArtLoupe canvasRef={canvasRef} />
        </>
      )}
    </div>
  );
}
