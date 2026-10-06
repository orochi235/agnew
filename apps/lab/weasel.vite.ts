import { readdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

/** The weasel checkout `@weasel-js/*` is linked from by a `file:` dependency, or undefined on npm's copy. */
export const WEASEL = linkedCheckout();

function linkedCheckout(): string | undefined {
  const labkit = realpathSync(join(import.meta.dirname, '../../node_modules/@weasel-js/labkit'));
  return labkit.includes('/node_modules/') ? undefined : resolve(labkit, '../..');
}

/** Serves a linked checkout's built `dist` as it is now, rather than as vite prebundled it at startup. */
export function weaselCheckout(): Plugin {
  return {
    name: 'agnew-weasel-checkout',
    config() {
      if (!WEASEL) return;
      return {
        optimizeDeps: { exclude: readdirSync(join(WEASEL, 'packages')).map((dir) => `@weasel-js/${dir}`) },
        // The checkout's own React and three would otherwise load beside ours.
        resolve: { dedupe: ['react', 'react-dom', 'three'] },
        server: { fs: { allow: [resolve(import.meta.dirname, '../..'), WEASEL] } },
      };
    },
  };
}
