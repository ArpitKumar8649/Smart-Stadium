import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'floor.geojson'],
      manifest: {
        name: 'Concourse Smart Stadium',
        short_name: 'Concourse',
        description: 'Your AI companion at every gate, seat, and section.',
        theme_color: '#00B67A',
        background_color: '#080A0E',
        display: 'standalone',
        icons: [
          {
            src: 'favicon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,geojson}'],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/crowd\/.*\/heatmap/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'crowd-heatmap',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 5, // Keep stale heatmap for 5 mins if offline
              },
            },
          },
          {
            urlPattern: /^\/api\/navigation\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'navigation-routes',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24, // Cache routes for a day
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
});
