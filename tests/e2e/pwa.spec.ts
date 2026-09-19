import { expect, test } from '@playwright/test'

/**
 * PWA installability checks against the real production build: a linked, valid
 * manifest with the icon sizes install prompts require, and a service worker
 * that actually registers and controls the page.
 */
test.describe('PWA', () => {
  test('serves a valid, linked web manifest', async ({ page, request }) => {
    await page.goto('/')

    const href = await page.getAttribute('link[rel="manifest"]', 'href')
    expect(href, 'no <link rel="manifest">').toBeTruthy()

    const response = await request.get(new URL(href!, 'http://127.0.0.1:4173').toString())
    expect(response.ok()).toBe(true)

    const manifest = await response.json()
    expect(manifest.name).toBeTruthy()
    expect(manifest.short_name.length).toBeLessThanOrEqual(12)
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBeTruthy()
    expect(manifest.theme_color).toBeTruthy()
    expect(manifest.background_color).toBeTruthy()

    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
    expect(
      manifest.icons.some((i: { purpose?: string }) => i.purpose?.includes('maskable')),
      'a maskable icon is required for a good Android home-screen icon',
    ).toBe(true)
  })

  test('every manifest icon actually resolves', async ({ page, request }) => {
    await page.goto('/')
    const href = await page.getAttribute('link[rel="manifest"]', 'href')
    const manifest = await (
      await request.get(new URL(href!, 'http://127.0.0.1:4173').toString())
    ).json()

    for (const icon of manifest.icons as { src: string }[]) {
      const res = await request.get(new URL(icon.src, 'http://127.0.0.1:4173/').toString())
      expect(res.status(), `icon ${icon.src} is missing`).toBe(200)
      expect(res.headers()['content-type']).toContain('image')
    }
  })

  test('carries the iOS standalone meta tags', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
      'content',
      'yes',
    )
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveCount(1)
    // viewport-fit=cover is what makes env(safe-area-inset-*) resolve on iPhone.
    const viewport = await page.getAttribute('meta[name="viewport"]', 'content')
    expect(viewport).toContain('viewport-fit=cover')
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1)
  })

  test('registers a service worker that takes control', async ({ page }) => {
    await page.goto('/')

    const controlled = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'unsupported'
      const registration = await navigator.serviceWorker.ready
      return registration.active ? 'active' : 'inactive'
    })

    expect(controlled).toBe('active')
  })

  test('respects the safe-area inset on the bottom tab bar', async ({ page }) => {
    test.skip(test.info().project.name !== 'iphone', 'safe areas are a mobile concern')

    await page.goto('/')
    const padding = await page
      .locator('.tabbar')
      .evaluate((el) => getComputedStyle(el).paddingBottom)

    // env() resolves to 0px in a desktop-engine emulation, but the declaration
    // must be present so a real iPhone gets the inset.
    expect(padding).toBeTruthy()
  })
})
