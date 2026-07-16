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
      // The explicit virtual registration handler reloads the app when a new
      // worker activates, so the app shell and precached chunks never belong to
      // different Vite releases.
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [
        'favicon.svg',
        'floor.geojson',
        'stadium/floor.geojson',
        'stadium/floorstack.json',
        'stadium/sections.json',
        'stadium/connections.json',
      ],
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
        globPatterns: ['**/*.{js,css,html,svg,geojson,json,wasm}'],
        // Cesium's runtime bundle is ~6MB. It is an optional, lazy-loaded 3D
        // enhancement — don't force every PWA install to precache it (Workbox's
        // default cap is 2MB). 2D navigation remains fully cacheable/offline.
        // Likewise, the per-floor interior room polygons (stadium/space/*, ~7MB)
        // only load when the 3D interior view opens — keep them out of precache.
        globIgnores: ['**/cesium/**', '**/stadium/space/**', '**/basis/**'],
        runtimeCaching: [
          {
            // Small, common map data is warmed from Landing and served without
            // another request when the fan opens the tactical map.
            urlPattern: /^\/(?:floor\.geojson|stadium\/(?:floor\.geojson|floorstack\.json|sections\.json|connections\.json))$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'concourse-stadium-assets-v1',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            // Floor-specific room polygons stay lazy, then remain available
            // for a later 3D visit without precaching all ~7 MB up front.
            urlPattern: /^\/stadium\/space\/.*\.geojson$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'stadium-room-geometry',
              expiration: {
                maxEntries: 12,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
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
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: '127.0.0.1',
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
