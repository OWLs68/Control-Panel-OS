import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import type { Plugin, ResolvedConfig } from 'vite'
import { copyFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Deployed under a sub-path on GitHub Pages (/Control-Panel-OS/), at root elsewhere.
// It must be an ABSOLUTE path: the router derives its basename from BASE_URL, and
// a relative base ('./') normalises to '/./', which matches no URL at all.
const base = process.env.DEPLOY_BASE ?? '/'

/**
 * Static hosts have no SPA fallback, so a hard refresh on /projects would 404.
 * GitHub Pages serves 404.html for unknown paths, and because the app reads
 * location on boot, that renders the right screen. `.nojekyll` keeps Pages from
 * running Jekyll over the build output.
 */
function staticHostFallback(): Plugin {
  let config: ResolvedConfig

  return {
    name: 'static-host-fallback',
    apply: 'build',
    configResolved(resolved) {
      config = resolved
    },
    // `writeBundle`, not `generateBundle`: index.html is emitted by Vite's own
    // HTML plugin and is not in the bundle map when earlier hooks run.
    writeBundle() {
      const outDir = resolve(config.root, config.build.outDir)
      copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'))
      writeFileSync(resolve(outDir, '.nojekyll'), '')
    },
  }
}

export default defineConfig({
  base,
  plugins: [
    react(),
    staticHostFallback(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'Roman AI OS — Control Panel',
        short_name: 'AI OS Panel',
        description:
          'Human-facing operational interface for Roman AI OS: system health, projects, memory, agents and activity.',
        lang: 'uk',
        dir: 'ltr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#0e1117',
        theme_color: '#0e1117',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Reuse of a NeverMind lesson (bug B-73): an iOS PWA that serves its own
        // code cache-first gets stuck on a stale build. The app shell is
        // NetworkFirst so a reachable network always wins; the cache is the
        // offline fallback, not the default answer.
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'cpos-app-shell',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
})
