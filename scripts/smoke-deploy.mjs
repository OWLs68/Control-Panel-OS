#!/usr/bin/env node
// Smoke-tests the PUBLISHED site.
//
// A local build passing proves the code is fine; it does not prove the deploy
// is. Relative asset paths, the service-worker scope and the manifest only fail
// once the app is served from its real URL — which is why this runs against
// SMOKE_URL on a GitHub runner rather than in the cloud dev session, where
// owls68.github.io is outside the egress policy.
import { chromium, devices } from '@playwright/test'

const URL = process.env.SMOKE_URL
if (!URL) {
  console.error('SMOKE_URL is not set')
  process.exit(1)
}

const failures = []
const check = (ok, what) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`)
  if (!ok) failures.push(what)
}

const browser = await chromium.launch()
const context = await browser.newContext({ ...devices['iPhone 14'] })
const page = await context.newPage()

const consoleErrors = []
page.on('pageerror', (e) => consoleErrors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })

const response = await page.goto(URL, { waitUntil: 'load' })
check(response?.ok() === true, `the page loads (${response?.status()})`)

await page.waitForSelector('body[data-ready="1"]', { timeout: 15_000 }).catch(() => {})
check(await page.locator('body').getAttribute('data-ready') === '1', 'the app boots and settles')

check(await page.locator('#tab-bar .tab-item').count() > 0, 'the bottom bar has modules')
check(await page.locator('#crow-zone .crow-figure').isVisible(), 'Crow is on screen')
check(await page.locator('#chat-input').isVisible(), 'the Crow field is present')

// The image is the asset most likely to 404 behind a sub-path.
const crowLoaded = await page.locator('.crow-figure img').evaluate(
  (img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0)
check(crowLoaded, 'the Crow image actually loaded')

const manifest = await page.evaluate(async () => {
  const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href')
  if (!href) return null
  const res = await fetch(new URL(href, location.href))
  return res.ok ? await res.json() : null
})
check(manifest?.name === 'Roma OS', 'the manifest resolves and names the app')

const swScope = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return reg?.scope ?? null
})
check(swScope !== null, `the service worker registered (${swScope ?? 'none'})`)

check(consoleErrors.length === 0, `the console is clean${consoleErrors.length ? `: ${consoleErrors[0]}` : ''}`)

await browser.close()

if (failures.length) {
  console.error(`\n${failures.length} smoke check(s) failed against ${URL}`)
  process.exit(1)
}
console.log(`\nAll smoke checks passed against ${URL}`)
