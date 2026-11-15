import { describe, expect, it } from 'vitest';
import { parsePresetFile } from './saved';

const file = (design: unknown) => JSON.stringify({ agnew: 1, name: 'Shared', design });

describe('parsePresetFile', () => {
  it('says what a file’s design left out', () => {
    const p = parsePresetFile(file({ blocks: [{ kind: 'arm' }, { kind: 'nope' }] }));
    expect(p.state.design.blocks).toHaveLength(1);
    expect(p.notice).toBe('Left out of the file, which this agnew can’t read: block “nope”.');
  });

  it('says nothing when the file loads whole', () => {
    expect(parsePresetFile(file({ blocks: [{ kind: 'arm' }] })).notice).toBe('');
  });

  it('names the version it refuses', () => {
    expect(() => parsePresetFile(file({ version: 3, blocks: [] }))).toThrow(
      'That file’s design can’t be read here: a version 3 design.',
    );
  });
});
