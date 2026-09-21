/**
 * Live memory — GBrain through the gateway, with the gateway played by
 * page.route(). Tailscale is not needed here: what these prove is the phone's
 * side of the seam — what it shows, what it keeps, and what it says when the
 * Mac is not there.
 */
import { expect, test, type Page, type Route } from '@playwright/test'
import { gotoModule } from './helpers.js'

const GW = 'https://gw.test'
const ALL_MODULES = ['control', 'agents', 'projects', 'memory', 'events']

const fact = (id: string, text: string, category = 'preference') => ({
  id, user_id: null, created_at: '2026-09-20T22:53:19.774Z', updated_at: '2026-09-20T22:53:19.774Z',
  deleted_at: null, hlc: null, text, category, ts: Date.parse('2026-09-20T22:53:17.918Z'),
})
const FACT_78 = fact('78', 'Runtime canonical source перемагає старіший STATE.')
const FACT_79 = fact('79', 'Salient writeback працює через client-side routing.', 'system')

function snapshot(memory: unknown[]) {
  return { memory, fetchedAt: Date.now(), source: 'gbrain:recall' }
}

async function serveJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function bootLive(page: Page, url: string | null = GW): Promise<void> {
  await page.addInitScript(({ url, modules }) => {
    localStorage.setItem('roma_data_source', 'live')
    if (url) localStorage.setItem('roma_gateway_url', url)
    else localStorage.removeItem('roma_gateway_url')
    localStorage.setItem('roma_active_modules', JSON.stringify(modules))
  }, { url, modules: ALL_MODULES })
}

async function ready(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
}

test('memory comes from the gateway, marked live; the other screens stay demo', async ({ page }) => {
  let hits = 0
  await page.route(`${GW}/**`, (route) => { hits++; return serveJson(route, 200, snapshot([FACT_78])) })
  await bootLive(page)
  await ready(page)

  // Control never asked the gateway for anything and still says «демо».
  await expect(page.locator('#screen-control .source-tag[data-origin="mock"]').first()).toBeVisible()

  await gotoModule(page, 'memory')
  const screen = page.locator('#screen-memory')
  await expect(screen.getByText(FACT_78.text)).toBeVisible()
  const tag = screen.locator('.source-tag')
  await expect(tag).toHaveAttribute('data-origin', 'live')
  await expect(tag).toHaveText('наживо')
  await expect(tag).toHaveAttribute('title', 'gbrain:recall')
  await expect(screen.locator('.data-notice')).toContainText('Джерело: gbrain:recall · оновлено щойно')
  await expect(screen.locator('.data-notice')).not.toContainText('не підключений')
  // The request left the page and reached the (routed) gateway: the worker did not swallow it.
  expect(hits).toBeGreaterThanOrEqual(1)

  // Projects is a delegated read: its notice names the demo fixtures, not the gateway.
  await gotoModule(page, 'projects')
  await expect(page.locator('#screen-projects .data-notice')).toContainText('Джерело: демо-дані · fixtures:projects')
})

test('a refresh redraws the screen you are looking at', async ({ page }) => {
  let facts = [FACT_78]
  await page.route(`${GW}/**`, (route) => serveJson(route, 200, snapshot(facts)))
  await bootLive(page)
  await ready(page)
  await gotoModule(page, 'memory')
  await expect(page.locator('#screen-memory .card-row')).toHaveCount(1)

  facts = [FACT_79, FACT_78]
  // Coming back into view triggers a refresh; emitDataChanged does the rest.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.locator('#screen-memory .card-row')).toHaveCount(2)
  await expect(page.locator('#screen-memory').getByText(FACT_79.text)).toBeVisible()
})

test('when the Mac is gone the last snapshot stays, and says so', async ({ page }) => {
  await page.route(`${GW}/**`, (route) => serveJson(route, 200, snapshot([FACT_78])))
  await bootLive(page)
  await ready(page)
  await gotoModule(page, 'memory')
  await expect(page.locator('#screen-memory').getByText(FACT_78.text)).toBeVisible()

  // Now the tunnel is down: the request fails outright.
  await page.unroute(`${GW}/**`)
  await page.route(`${GW}/**`, (route) => route.abort('failed'))
  await page.reload()
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
  await gotoModule(page, 'memory')
  const screen = page.locator('#screen-memory')
  await expect(screen.getByText(FACT_78.text)).toBeVisible()
  await expect(screen.locator('.source-tag')).toHaveAttribute('data-origin', 'live')
  await expect(screen.locator('.data-notice')).toContainText('Оновлено щойно · Mac недоступний')
  // The cache is the normalised snapshot and nothing else.
  const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('roma_live_snapshot') ?? 'null'))
  expect(Object.keys(cached).sort()).toEqual(['fetchedAt', 'memory', 'source'])
})

test('403 is «немає доступу», not a demo screen', async ({ page }) => {
  await page.route(`${GW}/**`, (route) => serveJson(route, 403, { error: 'forbidden' }))
  await bootLive(page)
  await ready(page)
  await gotoModule(page, 'memory')
  const screen = page.locator('#screen-memory')
  await expect(screen.locator('.source-tag')).toHaveAttribute('data-origin', 'live')
  await expect(screen.locator('.data-notice')).toContainText('Немає даних · немає доступу')
  await expect(screen.getByText('Памʼять порожня')).toBeVisible()
})

test('garbage from the gateway is «відповідь не розпізнана»', async ({ page }) => {
  await page.route(`${GW}/**`, (route) => serveJson(route, 200, '<html>oops'))
  await bootLive(page)
  await ready(page)
  await gotoModule(page, 'memory')
  await expect(page.locator('#screen-memory .data-notice')).toContainText('відповідь gateway не розпізнана')
})

test('live without an address says so, and the settings row shows where to type it', async ({ page }) => {
  await bootLive(page, null)
  await ready(page)
  await gotoModule(page, 'memory')
  await expect(page.locator('#screen-memory .data-notice')).toContainText('адресу gateway не задано')

  await page.locator('[data-action="open-settings"]').tap()
  await expect(page.locator('#settings-gateway-row')).toBeVisible()
  await expect(page.locator('#settings-gateway-status')).toContainText('Адресу не задано')
  await expect(page.locator('[data-action="settings-source"][data-source="live"]')).toHaveClass(/active/)
})

test('back to demo drops the live cache and the demo facts return', async ({ page }) => {
  await page.route(`${GW}/**`, (route) => serveJson(route, 200, snapshot([FACT_78])))
  await bootLive(page)
  await ready(page)
  await gotoModule(page, 'memory')
  await expect(page.locator('#screen-memory').getByText(FACT_78.text)).toBeVisible()

  await page.locator('[data-action="open-settings"]').tap()
  await page.locator('[data-action="settings-source"][data-source="demo"]').tap()
  await expect(page.locator('#settings-gateway-row')).toHaveCount(0)
  await page.locator('#settings-modal').tap({ position: { x: 20, y: 20 } })
  await expect(page.locator('#settings-modal')).toHaveCount(0)

  const screen = page.locator('#screen-memory')
  await expect(screen.locator('.source-tag')).toHaveAttribute('data-origin', 'mock')
  await expect(screen.getByText(FACT_78.text)).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('roma_live_snapshot'))).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('roma_data_source'))).toBe('demo')
})
