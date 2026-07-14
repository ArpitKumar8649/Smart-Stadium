import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [
    react(),
    // npm workspaces hoists Cesium to the monorepo root. The plugin otherwise
    // looks for frontend/node_modules/cesium (which does not exist), causing
    // /cesium/Widgets/*.css and /cesium/Assets/*.json to fall through to the
    // SPA HTML instead of their real MIME types.
    cesium({
      cesiumBuildRootPath: '../node_modules/cesium/Build',
      cesiumBuildPath: '../node_modules/cesium/Build/Cesium/',
    }),
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
        // Cesium's runtime bundle is ~6MB. It is an optional, lazy-loaded 3D
        // enhancement — don't force every PWA install to precache it (Workbox's
        // default cap is 2MB). 2D navigation remains fully cacheable/offline.
        globIgnores: ['**/cesium/**'],
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
