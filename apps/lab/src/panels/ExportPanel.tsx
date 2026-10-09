import { useState } from 'react';
import { download, fileStem, presetLabel } from '../files';
import { useAgnew, useAgnewView } from '../session';

/** PNGs at a multiple of screen resolution, and WebM recordings. */
export function ExportPanel() {
  const { state, setState } = useAgnew();
  const viewRef = useAgnewView();
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(10);
  const stem = fileStem(presetLabel(state.preset));

  const exportPNG = async (scale: number) => {
    const blob = await viewRef.current?.exportPNG(scale);
    if (blob) download(blob, `${stem}@${scale}x.png`);
  };
  const record = async () => {
    const view = viewRef.current;
    if (!view || recording) return;
    setState((s) => ({ ...s, playing: true }));
    setRecording(true);
    try {
      download(await view.record(recordSeconds, { restartTrace: true }), `${stem}.webm`);
    } finally {
      setRecording(false);
    }
  };

  return (
    <div className="ag-panel">
      <div className="ag-buttons">
        {[1, 2, 4].map((k) => (
          <button className="ag-btn" key={k} type="button" onClick={() => exportPNG(k)}>
            PNG {k}×
          </button>
        ))}
      </div>
      <div className="ag-buttons">
        <label className="ag-inline">
          <input
            type="number"
            min={1}
            max={120}
            value={recordSeconds}
            onChange={(e) => setRecordSeconds(Math.max(1, Number(e.target.value) || 1))}
          />
          s
        </label>
        <button className="ag-btn" type="button" onClick={record} disabled={recording}>
          {recording ? 'Recording…' : 'Record video'}
        </button>
      </div>
    </div>
  );
}
