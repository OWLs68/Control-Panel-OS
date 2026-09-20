/**
 * Playwright, aimed at the only device that matters for Stage 1.
 *
 * iOS ships WebKit, so WebKit is the engine that counts — but this cloud
 * session cannot download it (the browser CDN is outside the egress policy),
 * and the pre-installed Chromium is all there is locally. So: Chromium with the
 * iPhone 14 viewport always, and WebKit on top when `PW_WEBKIT=1`, which CI
 * sets after installing it on the runner.
 *
 * Emulated Chromium catches layout, geometry and logic. It does NOT catch the
 * iOS-only faults — rubber-banding, backdrop clipping, the keyboard's visual
 * viewport — which is why those still need a real phone.
 */
import { defineConfig, devices } from '@playwright/test'
import { resolveChromiumPath } from './scripts/chromium-path.mjs'

const chromium = resolveChromiumPath()
const withWebkit = process.env.PW_WEBKIT === '1'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'iphone-chromium',
      use: {
        ...devices['iPhone 14'],
        defaultBrowserType: 'chromium',
        ...(chromium ? { launchOptions: { executablePath: chromium } } : {}),
      },
    },
    ...(withWebkit ? [{ name: 'iphone-webkit', use: { ...devices['iPhone 14'] } }] : []),
  ],
  webServer: {
    command: 'npm run build && npm run serve',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
