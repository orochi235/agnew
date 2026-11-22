import { fileURLToPath } from 'node:url';
import { weaselIcons } from '@weasel-js/icons-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative, so the build works at any path: the Pages project site lives
  // under /agnew/.
  base: './',
  plugins: [react(), weaselIcons.vite({ mode: 'app' })],
  resolve: {
    alias: {
      // Develop against the library source; the published package ships dist.
      agnew: fileURLToPath(new URL('../../packages/agnew/src', import.meta.url)),
    },
  },
  server: { host: '::', port: 5190 },
});
