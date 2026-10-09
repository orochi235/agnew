import { TrialLoupe } from '@weasel-js/labkit/loupe';
import { type RefObject, useCallback } from 'react';

/** labkit's pixel lens over the render, switched from the trial's toolbar. The
 *  view keeps its drawing buffer, so the lens reads the WebGL canvas directly,
 *  with no capture after each draw. */
export function ArtLoupe({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const source = useCallback(() => canvasRef.current, [canvasRef]);
  return <TrialLoupe source={source} hostRef={canvasRef} />;
}
