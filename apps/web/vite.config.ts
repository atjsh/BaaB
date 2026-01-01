import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectManifest: {
        swSrc: 'src/sw.ts',
        maximumFileSizeToCacheInBytes: 3000000,
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
      manifest: {
        name: 'BaaB',
        short_name: 'BaaB',
        description: 'Browser as a Backend',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
});
