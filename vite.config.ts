import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      manifestFilename: 'manifest.json',
      includeAssets: [
        'favicon.svg',
        'vajra-emblem.png',
        'vajra-emblem.svg',
        'vajra-logo.png',
        'vajra-wordmark.png',
        'contact-library/*.png',
        'textures/*.png',
      ],
      manifest: {
        name: 'VAJRA // Counter-Drone Training Simulator',
        short_name: 'VAJRA',
        description: 'Offline browser-based counter-drone training simulator',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ded7ca',
        theme_color: '#ded7ca',
        icons: [
          {
            src: '/vajra-emblem.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/vajra-logo.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/vajra-emblem.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,json,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/v1'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'vajra-v1-api-cache',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ request }) =>
              ['style', 'script', 'worker', 'image', 'font', 'document'].includes(request.destination),
            handler: 'CacheFirst',
            options: {
              cacheName: 'vajra-local-assets-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    globals: true,
  },
});
