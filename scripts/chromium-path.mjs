/**
 * Resolves a Chromium binary for Playwright.
 *
 * CI images (and this cloud environment) often ship a pre-installed Chromium
 * whose build number does not match the one the installed @playwright/test
 * expects. Rather than downloading a second browser, point Playwright at the
 * one that is already there.
 *
 * Returns `undefined` when nothing pre-installed is found, which lets
 * Playwright fall back to its own managed browser.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'

export function resolveChromiumPath() {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) {
    return process.env.CHROMIUM_PATH
  }
  if (!existsSync(ROOT)) return undefined

  const candidate = readdirSync(ROOT)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort()
    .reverse()
    .map((name) => join(ROOT, name, 'chrome-linux', 'chrome'))
    .find((path) => existsSync(path))

  return candidate
}
