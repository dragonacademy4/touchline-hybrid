import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg', 'icons/*.png', 'og.png'],
      manifest: {
        name: 'Touchline: pitch-side notes',
        short_name: 'Touchline',
        description: 'Pitch-side session notes for grassroots youth football coaches. Works offline; names are hidden before anything leaves the phone.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f5f3ec',
        theme_color: '#123b2c',
        lang: 'en-GB',
        categories: ['sports', 'education', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 3_000_000,
      },
    }),
  ],
  build: { target: 'es2022', sourcemap: true },
});
