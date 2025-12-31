import react from '@vitejs/plugin-react';
import { tscPlugin } from '@wroud/vite-plugin-tsc';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tscPlugin({
      tscArgs: ['-b'],
      prebuild: true,
      packageManager: 'npx' as 'npm',
      verbose: true,
    }),
  ],
});
