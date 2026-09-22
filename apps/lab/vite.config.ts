import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Develop against the library source; the published package ships dist.
      agnew: fileURLToPath(new URL('../../packages/agnew/src', import.meta.url)),
    },
  },
  server: { host: '::', port: 5190 },
});
