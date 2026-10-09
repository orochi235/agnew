import { SAVED_PREFIX } from './saved';

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const presetLabel = (preset: string) => (preset.startsWith(SAVED_PREFIX) ? preset.slice(SAVED_PREFIX.length) : preset);

export function fileStem(name: string) {
  return `agnew-${(name || 'custom').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}
