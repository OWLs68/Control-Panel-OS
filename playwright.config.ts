import { defineConfig, devices } from '@playwright/test'
import { resolveChromiumPath } from './scripts/chromium-path.mjs'

/**
 * E2E configuration.
 *
 * Two viewports, because the panel is mobile-first with a desktop layout on
 * top: an iPhone-sized project (bottom tab bar, safe areas) and a desktop one
 * (sidebar). Both run on Chromium — this environment ships no WebKit build, so
 * genuine iOS quirks (rubber-band scrolling, backdrop-filter compositing,
 * standalone status bar) still need a manual pass on a real iPhone.
 *
 * Tests run against the production build via `vite preview`, so the service
 * worker and manifest under test are the ones that actually ship.
 */
const executablePath = resolveChromiumPath()

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    {
      name: 'iphone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
