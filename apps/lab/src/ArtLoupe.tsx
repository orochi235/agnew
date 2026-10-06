import { TrialLoupe } from '@weasel-js/labkit/loupe';
import { type RefObject, useCallback } from 'react';

interface Props {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Up for good; hold Alt to peek either way. */
  on: boolean;
}

/** labkit's pixel lens over the render. The view keeps its drawing buffer, so
 *  the lens reads the WebGL canvas directly, with no capture after each draw. */
export function ArtLoupe({ canvasRef, on }: Props) {
  const source = useCallback(() => canvasRef.current, [canvasRef]);
  return <TrialLoupe enabled={on} source={source} hostRef={canvasRef} />;
}
